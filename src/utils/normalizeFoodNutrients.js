/**
 * FDC search returns AbridgedFoodNutrient (name + amount); detail GET returns
 * FoodNutrient (amount + nested nutrient). Unify to { nutrientName, value, unitName }.
 */

function getNutrientName(entry) {
  const nested = entry?.nutrient?.name
  const top = entry?.nutrientName ?? entry?.name
  return String(nested || top || '')
    .toLowerCase()
    .trim()
}

function getNutrientNumericValue(entry) {
  const raw = entry?.value ?? entry?.amount
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : null
}

function getUnitName(entry) {
  const nested = entry?.nutrient?.unitName
  const top = entry?.unitName
  return String(nested || top || '').toLowerCase().trim()
}

export function normalizeFoodNutrientsArray(raw) {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((entry) => {
    const nutrientName = getNutrientName(entry)
    const value = getNutrientNumericValue(entry) ?? 0
    const unitName = getUnitName(entry)

    return {
      nutrientName,
      value,
      unitName,
    }
  })
}

export function findNutrientByName(foodNutrients, nutrientName) {
  const target = String(nutrientName || '').toLowerCase().trim()
  return foodNutrients.find((n) => n.nutrientName === target)
}

export function withNormalizedFoodNutrients(food) {
  if (!food || typeof food !== 'object') {
    return food
  }

  return {
    ...food,
    foodNutrients: normalizeFoodNutrientsArray(food.foodNutrients),
  }
}

export function probeFoodNutrientShape(food) {
  const list = Array.isArray(food?.foodNutrients) ? food.foodNutrients : []
  const first = list[0]
  return {
    fdcId: food?.fdcId ?? null,
    dataType: food?.dataType ?? null,
    hasServingSize: food?.servingSize != null && String(food.servingSize).trim() !== '',
    servingSizeUnit: food?.servingSizeUnit ?? null,
    foodNutrientsLength: list.length,
    firstNutrientKeys: first && typeof first === 'object' ? Object.keys(first) : [],
    firstNutrientHas: {
      value: first != null && 'value' in first,
      amount: first != null && 'amount' in first,
      nutrientName: first != null && 'nutrientName' in first,
      name: first != null && 'name' in first,
      nutrient: first != null && 'nutrient' in first,
    },
  }
}
