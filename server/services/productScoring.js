import { calculateProductHealth } from '../../src/utils/calculateProductHealth.js'
import { calculateGlobalHealthScore } from '../../src/utils/calculateGlobalHealthScore.js'
import { findNutrientByName, normalizeFoodNutrientsArray } from '../../src/utils/normalizeFoodNutrients.js'

function addedSugarsPerServing(food, normalizedNutrients) {
  const servingSize = Number(food?.servingSize) || null
  if (!Number.isFinite(servingSize) || servingSize <= 0) {
    return null
  }

  const added = findNutrientByName(normalizedNutrients, 'sugars, added')
  if (!added) {
    return null
  }

  const gramsPer100 = Number(added.value)
  if (!Number.isFinite(gramsPer100)) {
    return null
  }

  return (gramsPer100 / 100) * servingSize
}

export function scoreFoodProduct(food) {
  const normalizedNutrients = normalizeFoodNutrientsArray(food?.foodNutrients)
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
      addedSugars: addedSugarsPerServing(food, normalizedNutrients),
    },
  )

  return {
    health,
    globalHealth,
  }
}
