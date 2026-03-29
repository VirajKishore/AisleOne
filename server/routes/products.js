import process from 'node:process'
import { findFoodByGtinDetailed } from '../services/usda.js'
import { mapFoodToApiProduct } from '../services/productMapper.js'
import { scoreFoodProduct } from '../services/productScoring.js'
import { buildAlternativeProducts } from '../services/smartSwaps.js'
import { probeFoodNutrientShape } from '../../src/utils/normalizeFoodNutrients.js'

const productResponseSchema = {
  type: 'object',
  properties: {
    gtin: { type: 'string' },
    name: { type: 'string' },
    brand: { type: 'string' },
    serving: {
      type: 'object',
      properties: {
        amount: { type: ['number', 'null'] },
        unit: { type: 'string' },
        description: { type: 'string' },
      },
    },
    ingredients: { type: 'string' },
    nutritionFacts: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          unit: { type: 'string' },
        },
      },
    },
    healthScore: { type: 'number' },
    alternativesStatus: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' },
      },
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          score: { type: 'number' },
          link: { type: 'string' },
        },
      },
    },
  },
}

function isApiDebugScoresEnabled(request) {
  if (process.env.API_DEBUG_SCORES === '1') {
    return true
  }

  const q = request?.query?.debug
  return q === '1' || q === 'true'
}

export async function registerProductRoutes(app) {
  app.get('/:gtin', {
    schema: {
      tags: ['products'],
      summary: 'Lookup a product by GTIN',
      params: {
        type: 'object',
        required: ['gtin'],
        properties: {
          gtin: {
            type: 'string',
            description: 'GTIN/UPC/EAN barcode number',
            pattern: '^[0-9]{8,14}$',
          },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          debug: {
            type: 'string',
            description:
              'Set to 1 to log full score breakdown (same as API_DEBUG_SCORES=1). Example: ?debug=1',
          },
        },
      },
      response: {
        200: productResponseSchema,
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { gtin } = request.params
      const debugScores = isApiDebugScoresEnabled(request)
      const { food, searchHit } = await findFoodByGtinDetailed(gtin)

      if (!food) {
        return reply.code(404).send({ error: 'Product not found.' })
      }

      if (debugScores) {
        request.log.info(
          {
            msg: 'gtin_usda_shape',
            gtin,
            searchHit: probeFoodNutrientShape(searchHit),
            enrichedFood: probeFoodNutrientShape(food),
          },
          'USDA GTIN lookup nutrient payload shape (search vs enriched)',
        )
      }

      const product = mapFoodToApiProduct(food, { debugScores })

      if (debugScores && product._debug) {
        request.log.info(
          {
            msg: 'primary_product_scoring',
            gtin,
            name: product.name,
            healthScore: product.healthScore,
            scoreInput: product._debug.scoreInput,
            scoreBreakdown: product._debug.scoreBreakdown,
          },
          'Primary product health score breakdown',
        )
      }

      if (product.healthScore === 0) {
        const { health, globalHealth } = scoreFoodProduct(food)
        request.log.warn(
          {
            msg: 'health_score_is_zero',
            hint: 'See nutriComponent, novaComponent, ingredientQualityAdjustment. Sum clamps to [0,100].',
            gtin,
            fdcId: food?.fdcId ?? null,
            normalizedNutriScore: health.normalizedScore,
            grade: health.grade,
            nutriInputs: health.input,
            nutriComponent: globalHealth.nutriComponent,
            novaGroup: globalHealth.novaGroup,
            novaComponent: globalHealth.novaComponent,
            ingredientQualityAdjustment: globalHealth.ingredientQualityAdjustment,
            macroBonus: globalHealth.macroBonus,
            additivePenalty: globalHealth.additivePenalty,
            sugarPenalty: globalHealth.sugarPenalty,
            grainScore: globalHealth.grainScore,
            foodNutrientsCount: Array.isArray(food?.foodNutrients) ? food.foodNutrients.length : 0,
            hasServingSize: food?.servingSize != null && String(food.servingSize).trim() !== '',
          },
          'Product healthScore is 0 (formula terms below; enable ?debug=1 or API_DEBUG_SCORES=1 for full probes)',
        )
      }

      const alternatives = await buildAlternativeProducts(product, {
        logger: debugScores ? request.log : null,
        debugScores,
      })
      const alternativesStatus = alternatives.length > 0
        ? {
            status: 'found',
            message: `Found ${alternatives.length} better alternative products.`,
          }
        : {
            status: 'none',
            message: 'No better product alternatives were found for this product.',
          }

      return {
        ...Object.fromEntries(
          Object.entries(product).filter(([key]) => key !== '_debug'),
        ),
        alternativesStatus,
        alternatives,
      }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ error: error.message || 'Internal server error.' })
    }
  })
}
