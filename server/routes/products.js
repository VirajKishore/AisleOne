import { findFoodByGtin } from '../services/usda.js'
import { mapFoodToApiProduct } from '../services/productMapper.js'
import { buildAlternativeProducts } from '../services/smartSwaps.js'

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
      const food = await findFoodByGtin(gtin)

      if (!food) {
        return reply.code(404).send({ error: 'Product not found.' })
      }

      const product = mapFoodToApiProduct(food)
      const alternatives = await buildAlternativeProducts(product)
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
        ...product,
        alternativesStatus,
        alternatives,
      }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ error: error.message || 'Internal server error.' })
    }
  })
}
