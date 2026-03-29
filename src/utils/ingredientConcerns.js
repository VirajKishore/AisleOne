/**
 * Ingredient concern database and nutrient threshold flagging.
 *
 * Each ingredient concern has:
 *   tier       – 'high' | 'medium' | 'low'
 *   name       – canonical display name
 *   reason     – one-line factual note shown in the extension (no jargon)
 *   matches    – strings searched for inside the lowercased ingredients text
 *
 * flagIngredients() returns one entry per matched concern, with the actual
 * text fragment found so the extension can highlight it directly on the page.
 *
 * flagNutrients() compares per-serving amounts against FDA-based thresholds
 * and returns flagged nutrients with the excess amount included.
 */

// ---------------------------------------------------------------------------
// Ingredient concern database
// ---------------------------------------------------------------------------
const INGREDIENT_CONCERNS = [
  // ── HIGH tier ─────────────────────────────────────────────────────────────
  {
    tier: 'high',
    name: 'Sodium Nitrite / Nitrate',
    reason: 'Linked to increased colorectal cancer risk in cured meats',
    matches: ['sodium nitrite', 'sodium nitrate', 'potassium nitrite', 'potassium nitrate'],
  },
  {
    tier: 'high',
    name: 'BHA / BHT / TBHQ',
    reason: 'Synthetic preservatives classified as possible carcinogens',
    matches: ['bha', 'bht', 'tbhq'],
  },
  {
    tier: 'high',
    name: 'Propyl Gallate',
    reason: 'Synthetic antioxidant linked to endocrine disruption',
    matches: ['propyl gallate'],
  },
  {
    tier: 'high',
    name: 'Potassium Bromate',
    reason: 'Flour additive banned in most countries due to cancer risk',
    matches: ['potassium bromate'],
  },
  {
    tier: 'high',
    name: 'Azodicarbonamide',
    reason: 'Flour bleaching agent banned in EU; may form carcinogenic byproducts',
    matches: ['azodicarbonamide'],
  },
  {
    tier: 'high',
    name: 'Artificial Colors',
    reason: 'Synthetic dyes linked to hyperactivity in children',
    matches: [
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
    ],
  },

  // ── MEDIUM tier ───────────────────────────────────────────────────────────
  {
    tier: 'medium',
    name: 'Aspartame',
    reason: 'Artificial sweetener; classified as possibly carcinogenic (IARC 2B)',
    matches: ['aspartame'],
  },
  {
    tier: 'medium',
    name: 'Sucralose',
    reason: 'Artificial sweetener; may alter gut bacteria at high intake',
    matches: ['sucralose'],
  },
  {
    tier: 'medium',
    name: 'Saccharin',
    reason: 'Artificial sweetener; linked to gut microbiome changes',
    matches: ['saccharin'],
  },
  {
    tier: 'medium',
    name: 'Acesulfame Potassium',
    reason: 'Artificial sweetener; limited long-term safety data',
    matches: ['acesulfame', 'acesulfame k', 'acesulfame potassium'],
  },
  {
    tier: 'medium',
    name: 'Carrageenan',
    reason: 'Seaweed extract linked to gut inflammation at high intake',
    matches: ['carrageenan'],
  },
  {
    tier: 'medium',
    name: 'High Fructose Corn Syrup',
    reason: 'Highly refined sweetener linked to obesity and insulin resistance',
    matches: ['high fructose corn syrup', 'high-fructose corn syrup'],
  },
  {
    tier: 'medium',
    name: 'Caramel Color (Class III/IV)',
    reason: 'May contain 4-MEI, a compound with cancer concerns at high intake',
    matches: ['caramel color', 'caramel colour'],
  },
  {
    tier: 'medium',
    name: 'MSG / Flavor Enhancers',
    reason: 'May cause sensitivity reactions in some individuals',
    matches: ['monosodium glutamate', 'msg', 'disodium inosinate', 'disodium guanylate'],
  },
  {
    tier: 'medium',
    name: 'PGPR',
    reason: 'Emulsifier used as a cheap substitute for cocoa butter',
    matches: ['pgpr', 'polyglycerol polyricinoleate'],
  },
  {
    tier: 'medium',
    name: 'DATEM / Sodium Stearoyl Lactylate',
    reason: 'Dough conditioners that indicate high industrial processing',
    matches: ['datem', 'sodium stearoyl lactylate', 'calcium stearoyl lactylate', 'ssl'],
  },

  // ── LOW tier ──────────────────────────────────────────────────────────────
  {
    tier: 'low',
    name: 'Artificial Flavors',
    reason: 'Lab-created compounds used in place of real food ingredients',
    matches: ['artificial flavor', 'artificial flavors', 'artificial flavour', 'artificial flavours'],
  },
  {
    tier: 'low',
    name: 'Maltodextrin',
    reason: 'Rapidly digested starch filler that can spike blood sugar',
    matches: ['maltodextrin'],
  },
  {
    tier: 'low',
    name: 'Modified Starch',
    reason: 'Chemically altered starch used as a thickener or stabilizer',
    matches: [
      'modified food starch',
      'modified corn starch',
      'modified potato starch',
      'modified tapioca starch',
      'modified starch',
    ],
  },
  {
    tier: 'low',
    name: 'Protein Isolates',
    reason: 'Heavily processed protein extracts stripped of natural co-nutrients',
    matches: [
      'soy protein isolate',
      'whey protein isolate',
      'pea protein isolate',
      'textured soy protein',
      'textured vegetable protein',
    ],
  },
  {
    tier: 'low',
    name: 'Hydrolyzed Protein',
    reason: 'Industrially broken-down protein, a hidden source of glutamate',
    matches: [
      'hydrolyzed protein',
      'hydrolyzed soy protein',
      'hydrolyzed wheat protein',
      'hydrolyzed vegetable protein',
    ],
  },
  {
    tier: 'low',
    name: 'Polysorbates',
    reason: 'Emulsifiers that may disrupt the gut microbiome in animal studies',
    matches: ['polysorbate 80', 'polysorbate 60', 'polysorbate 20', 'polysorbate'],
  },
  {
    tier: 'low',
    name: 'Corn Syrup Solids',
    reason: 'Refined sugar concentrate from corn with limited nutritional value',
    matches: ['corn syrup solids', 'corn syrup'],
  },
]

// ---------------------------------------------------------------------------
// Nutrient thresholds (per serving, based on FDA daily values)
// ---------------------------------------------------------------------------
// Each entry has sorted tiers from most to least severe.
const NUTRIENT_THRESHOLDS = [
  {
    key: 'sodium',
    label: 'Sodium',
    unit: 'mg',
    dailyValue: 2300,
    tiers: [
      { tier: 'high', threshold: 690, reason: 'Very high sodium — over 30% of daily limit per serving' },
      { tier: 'medium', threshold: 345, reason: 'High sodium — over 15% of daily limit per serving' },
    ],
  },
  {
    key: 'addedSugars',
    label: 'Added Sugars',
    unit: 'g',
    dailyValue: 50,
    tiers: [
      { tier: 'high', threshold: 12.5, reason: 'Very high added sugars — over 25% of daily limit per serving' },
      { tier: 'medium', threshold: 6, reason: 'High added sugars — over 12% of daily limit per serving' },
    ],
  },
  {
    key: 'saturatedFat',
    label: 'Saturated Fat',
    unit: 'g',
    dailyValue: 20,
    tiers: [
      { tier: 'high', threshold: 6, reason: 'Very high saturated fat — over 30% of daily limit per serving' },
      { tier: 'medium', threshold: 3, reason: 'High saturated fat — over 15% of daily limit per serving' },
    ],
  },
  {
    key: 'transFat',
    label: 'Trans Fat',
    unit: 'g',
    dailyValue: null,
    tiers: [
      { tier: 'high', threshold: 0.5, reason: 'Contains trans fat — strongly linked to heart disease' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan the ingredients string against the concern database.
 * Returns one result per concern entry matched (not per individual match string),
 * with `matchedText` set to the first fragment found so the extension can
 * highlight it in the source page.
 *
 * @param {string} ingredientsString
 * @returns {{ tier: string, name: string, reason: string, matchedText: string }[]}
 */
export function flagIngredients(ingredientsString) {
  const text = String(ingredientsString || '').toLowerCase()
  if (!text) {
    return []
  }

  const results = []

  for (const concern of INGREDIENT_CONCERNS) {
    const matchedText = concern.matches.find((m) => text.includes(m))
    if (matchedText) {
      results.push({
        tier: concern.tier,
        name: concern.name,
        reason: concern.reason,
        matchedText,
      })
    }
  }

  return results
}

/**
 * Compare per-serving nutrition amounts against thresholds.
 * `nutritionFacts` is the object produced by mapFoodToApiProduct:
 *   { sodium: { amount: 780, unit: 'mg' }, addedSugars: { amount: 14, unit: 'g' }, ... }
 *
 * @param {Record<string, { amount: number, unit: string }>} nutritionFacts
 * @returns {{ nutrient: string, amount: number, unit: string, tier: string, dailyValuePct: string|null, reason: string }[]}
 */
export function flagNutrients(nutritionFacts) {
  if (!nutritionFacts || typeof nutritionFacts !== 'object') {
    return []
  }

  const results = []

  for (const config of NUTRIENT_THRESHOLDS) {
    const fact = nutritionFacts[config.key]
    const amount = Number(fact?.amount)

    if (!Number.isFinite(amount) || amount <= 0) {
      continue
    }

    const matchedTier = config.tiers.find((t) => amount >= t.threshold)
    if (!matchedTier) {
      continue
    }

    const dailyValuePct = config.dailyValue
      ? `${Math.round((amount / config.dailyValue) * 100)}%`
      : null

    results.push({
      nutrient: config.label,
      amount,
      unit: config.unit,
      tier: matchedTier.tier,
      dailyValuePct,
      reason: matchedTier.reason,
    })
  }

  return results
}

/**
 * Combined concerns object for the API response.
 *
 * @param {string} ingredientsString
 * @param {Record<string, { amount: number, unit: string }>} nutritionFacts
 * @returns {{ ingredients: Array, nutrients: Array }}
 */
export function buildConcerns(ingredientsString, nutritionFacts) {
  return {
    ingredients: flagIngredients(ingredientsString),
    nutrients: flagNutrients(nutritionFacts),
  }
}
