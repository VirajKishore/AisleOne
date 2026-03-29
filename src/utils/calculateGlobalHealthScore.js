const ADDITIVE_PENALTIES = {
  high: ['artificial color', 'sodium nitrite', 'bha', 'bht'],
  medium: ['sucralose', 'aspartame', 'acesulfame', 'carrageenan', 'maltodextrin', 'pgpr'],
  low: ['lecithin', 'flavor', 'mono and diglycerides'],
}

const WHOLE_FOOD_KEYWORDS = [
  'milk',
  'egg',
  'eggs',
  'chicken',
  'salmon',
  'tuna',
  'yogurt',
  'kefir',
  'oats',
  'rice',
  'beans',
  'lentils',
  'nuts',
  'almonds',
]

const WHOLE_GRAINS = ['whole wheat', 'whole grain', 'brown rice', 'quinoa', 'oats']
const REFINED_GRAINS = ['enriched wheat flour', 'bleached flour', 'refined wheat flour']
const ADDED_SUGARS = ['corn syrup', 'cane sugar', 'dextrose', 'fructose', 'invert sugar']
const GRAIN_FOOD_KEYWORDS = ['bread', 'cereal', 'cracker', 'pasta', 'granola', 'tortilla', 'grain']

const NUTRI_POINTS = {
  a: 95,
  b: 80,
  c: 60,
  d: 35,
  e: 15,
}

const NOVA_SCORES = {
  1: 20,
  2: 10,
  3: 0,
  4: -12,
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function resolveNutriBaseScore(nutriScoreValue, normalizedNutriScore) {
  if (Number.isFinite(normalizedNutriScore)) {
    return clampScore(normalizedNutriScore)
  }

  const normalizedGrade = String(nutriScoreValue || '').trim().toLowerCase()
  return NUTRI_POINTS[normalizedGrade] ?? 0
}

function normalizeText(value) {
  return String(value || '').toLowerCase()
}

function getIngredientCount(ingredientsString) {
  return String(ingredientsString || '')
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean).length
}

function getAdditiveMatches(ingredients) {
  return {
    high: ADDITIVE_PENALTIES.high.filter((item) => ingredients.includes(item)),
    medium: ADDITIVE_PENALTIES.medium.filter((item) => ingredients.includes(item)),
    low: ADDITIVE_PENALTIES.low.filter((item) => ingredients.includes(item)),
  }
}

function computeAdditivePenalty(additiveMatches) {
  const highPenalty = Math.min(16, additiveMatches.high.length * 8)
  const mediumPenalty = Math.min(8, additiveMatches.medium.length * 4)
  const lowPenalty = Math.min(3, additiveMatches.low.length)

  return -(highPenalty + mediumPenalty + lowPenalty)
}

function computeIngredientLengthScore(ingredientsString) {
  const count = getIngredientCount(ingredientsString)

  if (count <= 0) {
    return 0
  }

  if (count <= 3) {
    return 8
  }

  if (count <= 6) {
    return 4
  }

  if (count <= 10) {
    return 0
  }

  if (count <= 20) {
    return -4
  }

  return -8
}

function isGrainBasedFood(text) {
  return GRAIN_FOOD_KEYWORDS.some((keyword) => text.includes(keyword))
}

function computeGrainQualityScore(text) {
  if (!isGrainBasedFood(text)) {
    return 0
  }

  if (WHOLE_GRAINS.some((grain) => text.includes(grain))) {
    return 8
  }

  if (REFINED_GRAINS.some((grain) => text.includes(grain))) {
    return -6
  }

  return 0
}

function computeAddedSugarPenalty(text, context = {}) {
  const addedSugars = Number(context.addedSugars)

  if (Number.isFinite(addedSugars) && addedSugars > 0) {
    if (addedSugars >= 12) {
      return -10
    }

    if (addedSugars >= 6) {
      return -6
    }

    return -3
  }

  return ADDED_SUGARS.some((sugar) => text.includes(sugar)) ? -6 : 0
}

function computeMacroDensityBonus(context = {}) {
  let score = 0
  const protein = Number(context.protein)
  const fiber = Number(context.fiber)

  if (Number.isFinite(protein)) {
    if (protein >= 15) {
      score += 8
    } else if (protein >= 8) {
      score += 4
    }
  }

  if (Number.isFinite(fiber)) {
    if (fiber >= 5) {
      score += 6
    } else if (fiber >= 3) {
      score += 3
    }
  }

  return score
}

function computeNovaGroup(ingredients, additiveMatches, ingredientCount) {
  if (!ingredients) {
    return 2
  }

  if (additiveMatches.high.length || additiveMatches.medium.length >= 2) {
    return 4
  }

  if (
    additiveMatches.medium.length === 1 ||
    additiveMatches.low.length >= 3 ||
    ingredientCount > 15
  ) {
    return 3
  }

  if (additiveMatches.low.length || ingredientCount > 8) {
    return 2
  }

  return 1
}

function computeWholeFoodBonus({
  ingredientsString,
  novaGroup,
  productName,
  foodType,
}) {
  if (novaGroup !== 1) {
    return 0
  }

  const normalizedText = `${String(productName || '')} ${String(ingredientsString || '')}`.toLowerCase()
  const ingredientCount = getIngredientCount(ingredientsString)
  const hasWholeFoodSignal = WHOLE_FOOD_KEYWORDS.some((keyword) => normalizedText.includes(keyword))

  if (!hasWholeFoodSignal) {
    return 0
  }

  let bonus = 0

  if (ingredientCount > 0 && ingredientCount <= 5) {
    bonus += 5
  }

  if (ingredientCount > 0 && ingredientCount <= 2) {
    bonus += 3
  }

  if (foodType === 'beverage' && normalizedText.includes('milk')) {
    bonus += 2
  }

  return Math.min(10, bonus)
}

export function calculateGlobalHealthScore(
  nutriScoreValue,
  ingredientsString,
  normalizedNutriScore = null,
  context = {},
) {
  const normalizedGrade = String(nutriScoreValue || '').trim().toLowerCase()
  const ingredients = normalizeText(ingredientsString)
  const categoryText = normalizeText(`${context.productName || ''} ${context.categoryText || ''}`)
  const searchableText = `${categoryText} ${ingredients}`.trim()
  const ingredientCount = getIngredientCount(ingredientsString)
  const additiveMatches = getAdditiveMatches(ingredients)
  const processedMarkersFound = [
    ...additiveMatches.high,
    ...additiveMatches.medium,
    ...additiveMatches.low,
  ]

  const nutriPoints = resolveNutriBaseScore(normalizedGrade, normalizedNutriScore)
  const nutriComponent = nutriPoints * 0.55
  const novaGroup = computeNovaGroup(ingredients, additiveMatches, ingredientCount)
  const novaComponent = NOVA_SCORES[novaGroup]
  const additivePenalty = computeAdditivePenalty(additiveMatches)
  const grainScore = computeGrainQualityScore(searchableText)
  const sugarPenalty = computeAddedSugarPenalty(searchableText, context)
  const ingredientLengthComponent = computeIngredientLengthScore(ingredientsString)
  const macroBonus = computeMacroDensityBonus(context)
  const wholeFoodBonus = computeWholeFoodBonus({
    ingredientsString,
    novaGroup,
    productName: context.productName,
    foodType: context.foodType,
  })
  const ingredientQualityAdjustment =
    additivePenalty + grainScore + sugarPenalty + ingredientLengthComponent + macroBonus + wholeFoodBonus

  return {
    totalScore: clampScore(
      nutriComponent +
        novaComponent +
        additivePenalty +
        grainScore +
        sugarPenalty +
        ingredientLengthComponent +
        macroBonus +
        wholeFoodBonus,
    ),
    nutriScoreGrade: (normalizedGrade || 'e').toUpperCase(),
    novaGroup,
    processedMarkersFound,
    additivePenalty,
    grainScore,
    sugarPenalty,
    ingredientLengthComponent,
    macroBonus,
    wholeFoodBonus,
    ingredientQualityAdjustment,
    nutriComponent: clampScore(nutriComponent),
    novaComponent,
  }
}
