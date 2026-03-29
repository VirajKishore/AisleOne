const RED_FLAGS = [
  'high fructose corn syrup',
  'maltodextrin',
  'lecithin',
  'flavor',
  'artificial color',
  'hydrogenated',
  'pgpr',
  'sucralose',
]

const NUTRI_POINTS = {
  a: 95,
  b: 80,
  c: 60,
  d: 35,
  e: 15,
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

export function calculateGlobalHealthScore(
  nutriScoreValue,
  ingredientsString,
  normalizedNutriScore = null,
) {
  const normalizedGrade = String(nutriScoreValue || '').trim().toLowerCase()
  const ingredients = String(ingredientsString || '').toLowerCase()

  const processedMarkersFound = RED_FLAGS.filter((flag) => ingredients.includes(flag))
  const novaGroup = processedMarkersFound.length ? 4 : 1
  const nutriPoints = resolveNutriBaseScore(normalizedGrade, normalizedNutriScore)
  const nutriComponent = nutriPoints * 0.7
  const novaComponent = novaGroup === 1 ? 30 : 5

  return {
    totalScore: clampScore(nutriComponent + novaComponent),
    nutriScoreGrade: (normalizedGrade || 'e').toUpperCase(),
    novaGroup,
    processedMarkersFound,
    nutriComponent: clampScore(nutriComponent),
    novaComponent,
  }
}
