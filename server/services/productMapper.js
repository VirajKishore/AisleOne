import { scoreFoodProduct } from './productScoring.js'
import { withNormalizedFoodNutrients } from '../../src/utils/normalizeFoodNutrients.js'
import { buildConcerns } from '../../src/utils/ingredientConcerns.js'

const NUTRIENT_CONFIG = [
  { key: 'calories', nutrientName: 'energy', unit: 'kcal', type: 'calories' },
  { key: 'protein', nutrientName: 'protein', unit: 'g' },
  { key: 'totalFat', nutrientName: 'total lipid (fat)', unit: 'g' },
  { key: 'saturatedFat', nutrientName: 'fatty acids, total saturated', unit: 'g' },
  { key: 'transFat', nutrientName: 'fatty acids, total trans', unit: 'g' },
  { key: 'cholesterol', nutrientName: 'cholesterol', unit: 'mg' },
  { key: 'sodium', nutrientName: 'sodium, na', unit: 'mg' },
  { key: 'totalCarbohydrate', nutrientName: 'carbohydrate, by difference', unit: 'g' },
  { key: 'dietaryFiber', nutrientName: 'fiber, total dietary', unit: 'g' },
  { key: 'totalSugars', nutrientName: 'total sugars', unit: 'g' },
  { key: 'addedSugars', nutrientName: 'sugars, added', unit: 'g' },
]

function findNutrient(foodNutrients = [], nutrientName) {
  return foodNutrients.find(
    (nutrient) => (nutrient?.nutrientName?.toLowerCase() || '') === nutrientName,
  )
}

function formatNumber(value, type = 'default') {
  if (!Number.isFinite(value)) {
    return 0
  }

  if (type === 'calories') {
    return Math.round(value)
  }

  return Math.round(value * 100) / 100
}

function computePerServingValue(nutrient, servingSize) {
  if (nutrient == null || servingSize == null) {
    return 0
  }

  const numericServingSize = Number(servingSize)
  if (!Number.isFinite(numericServingSize) || numericServingSize === 0) {
    return 0
  }

  const numericValue = Number(nutrient.value)
  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return (numericValue / 100) * numericServingSize
}

function getPerServingAmount(foodNutrients, nutrientName, servingSize) {
  const nutrient = findNutrient(foodNutrients, nutrientName)
  return computePerServingValue(nutrient, servingSize)
}

export function mapFoodToApiProduct(food, options = {}) {
  const { debugScores = false } = options
  const foodForFacts = withNormalizedFoodNutrients(food)
  const nutrients = Array.isArray(foodForFacts?.foodNutrients) ? foodForFacts.foodNutrients : []
  const servingSize = Number(food?.servingSize) || null
  const servingUnit = food?.servingSizeUnit || ''

  const nutritionFacts = NUTRIENT_CONFIG.reduce((accumulator, item) => {
    const nutrient = findNutrient(nutrients, item.nutrientName)
    const amount = computePerServingValue(nutrient, servingSize)

    accumulator[item.key] = {
      amount: formatNumber(amount, item.type),
      unit: item.unit,
    }

    return accumulator
  }, {})

  const { health, globalHealth } = scoreFoodProduct(food)
  const concerns = buildConcerns(food.ingredients, nutritionFacts)

  const base = {
    gtin: food.gtinUpc || '',
    name: food.description || 'Unnamed product',
    brand: food.brandName || food.brandOwner || 'Brand not listed',
    serving: {
      amount: servingSize,
      unit: servingUnit,
      description:
        food.householdServingFullText ||
        [servingSize, servingUnit].filter(Boolean).join(' ') ||
        'Not listed',
    },
    ingredients: food.ingredients || 'Not listed',
    nutritionFacts,
    healthScore: globalHealth.totalScore,
    concerns,
  }

  if (!debugScores) {
    return base
  }

  return {
    ...base,
    _debug: {
      scoreInput: {
        grade: health.grade,
        normalizedScore: health.normalizedScore,
        foodType: health.foodType,
        nutriScoreMode: health.nutriScoreMode,
        nutriInputs: health.input,
        proteinPerServing: getPerServingAmount(nutrients, 'protein', servingSize),
        fiberPerServing: getPerServingAmount(nutrients, 'fiber, total dietary', servingSize),
      },
      scoreBreakdown: globalHealth,
    },
  }
}
