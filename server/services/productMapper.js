import { calculateProductHealth } from '../../src/utils/calculateProductHealth.js'
import { calculateGlobalHealthScore } from '../../src/utils/calculateGlobalHealthScore.js'

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
  if (!nutrient?.value || !servingSize) {
    return 0
  }

  const numericValue = Number(nutrient.value)
  const numericServingSize = Number(servingSize)

  if (!Number.isFinite(numericValue) || !Number.isFinite(numericServingSize)) {
    return 0
  }

  return (numericValue / 100) * numericServingSize
}

export function mapFoodToApiProduct(food) {
  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : []
  const servingSize = Number(food?.servingSize) || null
  const servingUnit = food?.servingSizeUnit || ''
  const addedSugarsNutrient = findNutrient(nutrients, 'sugars, added')

  const nutritionFacts = NUTRIENT_CONFIG.reduce((accumulator, item) => {
    const nutrient = findNutrient(nutrients, item.nutrientName)
    const amount = computePerServingValue(nutrient, servingSize)

    accumulator[item.key] = {
      amount: formatNumber(amount, item.type),
      unit: item.unit,
    }

    return accumulator
  }, {})

  const health = calculateProductHealth(food)
  const globalHealth = calculateGlobalHealthScore(
    health.grade,
    food.ingredients,
    health.normalizedScore,
    {
      productName: food.description,
      foodType: health.foodType,
      categoryText: food.foodCategory,
      protein: health.input.proteins,
      fiber: health.input.fibers,
      addedSugars: Number(addedSugarsNutrient?.value),
    },
  )

  return {
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
  }
}
