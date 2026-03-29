import { nutriScore } from 'nutri-score'
import { normalizeFoodNutrientsArray } from './normalizeFoodNutrients.js'

const ENERGY_KCAL_TO_KJ = 4.184
const NUTRI_SCORE_RANGES = {
  solid: { min: -15, max: 40 },
  beverage: { min: -15, max: 10 },
}
const DAIRY_KEYWORDS = ['milk', 'whole milk', 'reduced fat milk', 'skim milk', 'yogurt', 'kefir']
const BEVERAGE_KEYWORDS = [
  'beverage',
  'drink',
  'soda',
  'cola',
  'juice',
  'tea',
  'coffee',
  'water',
  'milk',
  'sparkling',
  'lemonade',
  'energy drink',
  'sports drink',
]

function getNutrientByName(foodNutrients = [], nutrientName) {
  return foodNutrients.find(
    (nutrient) => (nutrient?.nutrientName?.toLowerCase() || '') === nutrientName,
  )
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function getSearchableText(food) {
  return [
    food?.description,
    food?.brandName,
    food?.foodCategory,
    food?.lowercaseDescription,
    food?.additionalDescriptions,
    food?.ingredients,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isDairyProduct(searchableText) {
  return DAIRY_KEYWORDS.some((keyword) => searchableText.includes(keyword))
}

function detectFoodType(food) {
  const searchableText = getSearchableText(food)

  if (BEVERAGE_KEYWORDS.some((keyword) => searchableText.includes(keyword))) {
    return 'beverage'
  }

  const servingUnit = String(food?.servingSizeUnit || '').toLowerCase()
  if (['ml', 'fl oz', 'floz', 'l'].includes(servingUnit)) {
    return 'beverage'
  }

  return 'solid'
}

function detectNutriScoreMode(food, foodType) {
  const searchableText = getSearchableText(food)

  if (foodType === 'beverage' && isDairyProduct(searchableText)) {
    return 'solid'
  }

  return foodType
}

export function calculateProductHealth(food) {
  const foodNutrients = normalizeFoodNutrientsArray(food?.foodNutrients)
  const foodType = detectFoodType(food)
  const nutriScoreMode = detectNutriScoreMode(food, foodType)
  const { min, max } = NUTRI_SCORE_RANGES[nutriScoreMode]

  const energyNutrient = getNutrientByName(foodNutrients, 'energy')
  const sugarNutrient = getNutrientByName(foodNutrients, 'total sugars')
  const saturatedFatNutrient = getNutrientByName(
    foodNutrients,
    'fatty acids, total saturated',
  )
  const sodiumNutrient = getNutrientByName(foodNutrients, 'sodium, na')
  const fiberNutrient = getNutrientByName(foodNutrients, 'fiber, total dietary')
  const proteinNutrient = getNutrientByName(foodNutrients, 'protein')

  const rawEnergy = toNumber(energyNutrient?.value)
  const energyUnit = energyNutrient?.unitName?.toLowerCase() || ''

  const nutriScoreInput = {
    energy: energyUnit === 'kcal' ? rawEnergy * ENERGY_KCAL_TO_KJ : rawEnergy,
    sugar: toNumber(sugarNutrient?.value),
    saturated_fats: toNumber(saturatedFatNutrient?.value),
    sodium: toNumber(sodiumNutrient?.value),
    fibers: toNumber(fiberNutrient?.value),
    proteins: toNumber(proteinNutrient?.value),
    fruit_percentage: 0,
  }

  const rawScore = nutriScore.calculate(nutriScoreInput, nutriScoreMode)
  const clampedScore = Math.max(min, Math.min(max, rawScore))
  const normalizedScore = Math.round(((max - clampedScore) / (max - min)) * 100)

  return {
    input: nutriScoreInput,
    score: rawScore,
    normalizedScore,
    grade: nutriScore.calculateClass(nutriScoreInput, nutriScoreMode),
    foodType,
    nutriScoreMode,
  }
}
