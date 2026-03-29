/**
 * Yuka-inspired composite health score (0–100)
 *
 * Score = NutriScore component (0–60) + NOVA component (0–30) + Additive component (0–10)
 *
 * NutriScore component:
 *   normalizedNutriScore × 0.6
 *   normalizedNutriScore is a 0–100 linear scale already adjusted for the different
 *   solid vs beverage Nutri-Score ranges by calculateProductHealth().
 *   Grade fallback: A=100, B=75, C=50, D=25, E=0.
 *
 * NOVA component (processing level):
 *   NOVA 1 – Unprocessed / minimally processed  → 30 pts
 *   NOVA 2 – Processed culinary ingredients      → 20 pts
 *   NOVA 3 – Processed foods                     → 10 pts
 *   NOVA 4 – Ultra-processed food products       →  0 pts
 *
 * Additive component (highest hazard tier wins):
 *   No concerning additives detected             → 10 pts
 *   Low-hazard additives only                    →  7 pts
 *   Medium-hazard additive present               →  3 pts
 *   High-hazard additive present                 →  0 pts
 */

// ---------------------------------------------------------------------------
// NOVA 4 markers – ultra-processed product indicators.
// Any match in the ingredients string → NOVA 4.
// ---------------------------------------------------------------------------
const NOVA4_MARKERS = [
  // Non-nutritive sweeteners
  'aspartame',
  'sucralose',
  'saccharin',
  'acesulfame',
  'neotame',
  'advantame',
  'stevia extract',
  'rebaudioside',
  'steviol glycoside',
  'monk fruit extract',

  // Synthetic antioxidants / preservatives
  'bha',
  'bht',
  'tbhq',
  'propyl gallate',
  'azodicarbonamide',
  'potassium bromate',

  // Nitrite / nitrate curing agents
  'sodium nitrite',
  'sodium nitrate',
  'potassium nitrite',
  'potassium nitrate',

  // Synthetic colorants
  'artificial color',
  'artificial colour',
  'fd&c',
  'yellow 5',
  'yellow 6',
  'red 40',
  'red 3',
  'blue 1',
  'blue 2',
  'green 3',
  'tartrazine',
  'sunset yellow',
  'allura red',
  'brilliant blue',
  'erythrosine',
  'quinoline yellow',

  // Artificial flavors
  'artificial flavor',
  'artificial flavors',

  // Ultra-processed sweeteners / carb fillers
  'high fructose corn syrup',
  'high-fructose corn syrup',
  'corn syrup solids',
  'maltodextrin',
  'dextrose',

  // Industrial protein isolates / hydrolysates
  'soy protein isolate',
  'whey protein isolate',
  'pea protein isolate',
  'hydrolyzed protein',
  'hydrolyzed soy protein',
  'hydrolyzed wheat protein',
  'hydrolyzed vegetable protein',
  'textured soy protein',
  'textured vegetable protein',

  // Modified starches
  'modified food starch',
  'modified corn starch',
  'modified potato starch',
  'modified tapioca starch',
  'modified starch',

  // Ultra-processed emulsifiers / stabilizers
  'polysorbate',
  'pgpr',
  'polyglycerol polyricinoleate',
  'datem',
  'sodium stearoyl lactylate',
  'calcium stearoyl lactylate',
  'ssl',

  // Flavor enhancers
  'monosodium glutamate',
  'msg',
  'disodium inosinate',
  'disodium guanylate',
  'autolyzed yeast extract',

  // Caramel color (class III/IV – 4-MEI concerns)
  'caramel color',
  'caramel colour',

  // Carrageenan (pro-inflammatory at high intake)
  'carrageenan',

  // Interesterified fats
  'interesterified',
]

// ---------------------------------------------------------------------------
// NOVA 3 markers – processed food indicators.
// Only checked when no NOVA 4 marker is present. Any match → NOVA 3.
// ---------------------------------------------------------------------------
const NOVA3_MARKERS = [
  'natural flavor',
  'natural flavors',
  'natural flavour',
  'natural flavours',
  'yeast extract',
  'smoke flavor',
  'smoke flavour',
  'smoked',

  // Simple acids used as preservatives / acidulants
  'citric acid',
  'lactic acid',
  'acetic acid',
  'malic acid',
  'fumaric acid',
  'tartaric acid',
  'ascorbic acid',
  'sodium ascorbate',
  'erythorbic acid',

  // Simple preservatives
  'sodium benzoate',
  'potassium sorbate',
  'calcium propionate',
  'sodium propionate',
  'sorbic acid',
  'propionic acid',
  'sodium bisulfite',
  'sulfur dioxide',

  // Leavening agents (processed baked goods)
  'sodium bicarbonate',
  'baking powder',
  'cream of tartar',
  'ammonium bicarbonate',

  // Hydrocolloids / simple stabilizers
  'xanthan gum',
  'guar gum',
  'locust bean gum',
  'carob bean gum',
  'tara gum',
  'gellan gum',
  'pectin',
  'agar',
  'gelatin',

  // Simple emulsifiers
  'soy lecithin',
  'sunflower lecithin',
  'lecithin',
  'mono and diglycerides',
  'mono- and diglycerides',
  'monoglycerides',
  'diglycerides',
]

// ---------------------------------------------------------------------------
// Additive hazard tiers (highest tier found determines additive component)
// ---------------------------------------------------------------------------
const HIGH_HAZARD_ADDITIVES = [
  'sodium nitrite',
  'sodium nitrate',
  'potassium nitrite',
  'potassium nitrate',
  'bha',
  'bht',
  'tbhq',
  'propyl gallate',
  'potassium bromate',
  'azodicarbonamide',
  'artificial color',
  'artificial colour',
  'fd&c',
  'yellow 5',
  'yellow 6',
  'red 40',
  'red 3',
  'blue 1',
  'blue 2',
  'green 3',
  'tartrazine',
  'sunset yellow',
  'allura red',
  'brilliant blue',
  'erythrosine',
]

const MEDIUM_HAZARD_ADDITIVES = [
  'aspartame',
  'sucralose',
  'saccharin',
  'acesulfame',
  'neotame',
  'carrageenan',
  'caramel color',
  'caramel colour',
  'pgpr',
  'datem',
  'sodium stearoyl lactylate',
  'monosodium glutamate',
  'msg',
  'disodium inosinate',
  'disodium guanylate',
  'high fructose corn syrup',
  'high-fructose corn syrup',
]

const LOW_HAZARD_ADDITIVES = [
  'artificial flavor',
  'artificial flavors',
  'natural flavor',
  'natural flavors',
  'modified food starch',
  'modified starch',
  'maltodextrin',
  'dextrose',
  'corn syrup solids',
  'soy protein isolate',
  'whey protein isolate',
  'pea protein isolate',
  'hydrolyzed protein',
  'xanthan gum',
  'guar gum',
  'pectin',
  'agar',
  'gelatin',
  'soy lecithin',
  'sunflower lecithin',
  'lecithin',
  'mono and diglycerides',
  'mono- and diglycerides',
  'monoglycerides',
  'diglycerides',
  'polysorbate',
  'sodium benzoate',
  'potassium sorbate',
  'calcium propionate',
  'citric acid',
  'ascorbic acid',
  'lactic acid',
  'stevia extract',
  'rebaudioside',
  'erythritol',
  'sorbitol',
  'xylitol',
  'maltitol',
  'yeast extract',
  'autolyzed yeast extract',
  'smoke flavor',
]

// Grade → 0-100 fallback when normalizedNutriScore is unavailable
const GRADE_FALLBACK = { a: 100, b: 75, c: 50, d: 25, e: 0 }

// NOVA group → processing component points
const NOVA_POINTS = { 1: 30, 2: 20, 3: 10, 4: 0 }

// Additive tier → component points
const ADDITIVE_POINTS = { none: 10, low: 7, medium: 3, high: 0 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clampScore(score) {
  const rounded = Math.round(score)
  if (!Number.isFinite(rounded)) {
    return 0
  }

  return Math.max(0, Math.min(100, rounded))
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

function containsAny(text, markers) {
  return markers.filter((marker) => text.includes(marker))
}

// ---------------------------------------------------------------------------
// NOVA classification
// ---------------------------------------------------------------------------
function classifyNova(ingredientsText, ingredientCount) {
  if (!ingredientsText) {
    return { novaGroup: 2, nova4Hits: [], nova3Hits: [] }
  }

  const nova4Hits = containsAny(ingredientsText, NOVA4_MARKERS)
  if (nova4Hits.length > 0) {
    return { novaGroup: 4, nova4Hits, nova3Hits: [] }
  }

  const nova3Hits = containsAny(ingredientsText, NOVA3_MARKERS)
  if (nova3Hits.length > 0) {
    return { novaGroup: 3, nova4Hits: [], nova3Hits }
  }

  // No additive markers found: use ingredient count as proxy for processing
  // ≤ 5 ingredients with no additives → likely unprocessed / minimally processed
  const novaGroup = ingredientCount > 0 && ingredientCount <= 5 ? 1 : 2
  return { novaGroup, nova4Hits: [], nova3Hits: [] }
}

// ---------------------------------------------------------------------------
// Additive hazard
// ---------------------------------------------------------------------------
function classifyAdditiveTier(ingredientsText) {
  if (containsAny(ingredientsText, HIGH_HAZARD_ADDITIVES).length > 0) {
    return 'high'
  }

  if (containsAny(ingredientsText, MEDIUM_HAZARD_ADDITIVES).length > 0) {
    return 'medium'
  }

  if (containsAny(ingredientsText, LOW_HAZARD_ADDITIVES).length > 0) {
    return 'low'
  }

  return 'none'
}

// ---------------------------------------------------------------------------
// Nutri-Score base (0–100)
// ---------------------------------------------------------------------------
function resolveNutriBase(nutriScoreGrade, normalizedNutriScore) {
  if (Number.isFinite(normalizedNutriScore) && normalizedNutriScore >= 0) {
    return clampScore(normalizedNutriScore)
  }

  const grade = String(nutriScoreGrade || '').trim().toLowerCase()
  return GRADE_FALLBACK[grade] ?? 0
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function calculateGlobalHealthScore(
  nutriScoreValue,
  ingredientsString,
  normalizedNutriScore = null,
) {
  const normalizedGrade = String(nutriScoreValue || '').trim().toLowerCase()
  const ingredients = normalizeText(ingredientsString)
  const ingredientCount = getIngredientCount(ingredientsString)

  // Nutri-Score component (0–60)
  const nutriBase = resolveNutriBase(normalizedGrade, normalizedNutriScore)
  const nutriComponent = nutriBase * 0.6

  // NOVA component (0–30)
  const { novaGroup, nova4Hits, nova3Hits } = classifyNova(ingredients, ingredientCount)
  const novaComponent = NOVA_POINTS[novaGroup]

  // Additive component (0–10)
  const additiveTier = classifyAdditiveTier(ingredients)
  const additiveComponent = ADDITIVE_POINTS[additiveTier]

  // All markers found (for UI display)
  const processedMarkersFound = [...nova4Hits, ...nova3Hits]

  // Total
  const totalScore = clampScore(nutriComponent + novaComponent + additiveComponent)

  return {
    totalScore,
    nutriScoreGrade: (normalizedGrade || 'e').toUpperCase(),
    novaGroup,
    processedMarkersFound,

    // Component breakdown (useful for debugging and UI)
    nutriComponent: Math.round(nutriComponent),
    novaComponent,
    additiveComponent,
    additiveTier,

    // Keep legacy fields so App.jsx doesn't break
    additivePenalty: -(10 - additiveComponent),
    grainScore: 0,
    sugarPenalty: 0,
    ingredientLengthComponent: 0,
    macroBonus: 0,
    wholeFoodBonus: 0,
    ingredientQualityAdjustment: additiveComponent - 10,
    rawIngredientQualityAdjustment: additiveComponent - 10,
  }
}
