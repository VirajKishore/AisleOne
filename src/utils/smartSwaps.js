import { GoogleGenAI } from '@google/genai'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const SERPER_API_KEY = import.meta.env.VITE_SERPER_API_KEY
const SERPER_SEARCH_URL = 'https://google.serper.dev/search'
const SERPER_SHOPPING_URL = 'https://google.serper.dev/shopping'
const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const productStrategyCache = new Map()

const DEFAULT_SWAP_STRATEGY = {
  broadCategory: 'Packaged Food',
  shelfQuery: 'healthy low-sugar packaged food brands',
  productFamily: '',
  preferredAttributes: [],
  avoidAttributes: [],
  includeTerms: [],
  excludeTerms: [],
  requiredFoodType: 'solid',
}

const MAX_ALTERNATIVE_QUERIES = 4
const MAX_CANDIDATE_RESULTS = 12

function getGeminiClient() {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing VITE_GEMINI_API_KEY.')
  }

  return new GoogleGenAI({ apiKey: GEMINI_API_KEY })
}

async function generateText(prompt) {
  const ai = getGeminiClient()
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  })

  return response?.text?.trim() || ''
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueTerms(values = []) {
  const seen = new Set()

  return values
    .map((value) => normalizeText(value))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false
      }

      seen.add(value)
      return true
    })
}

function uniqueStrings(values = []) {
  const seen = new Set()

  return values.filter((value) => {
    const normalizedValue = normalizeText(value)
    if (!normalizedValue || seen.has(normalizedValue)) {
      return false
    }

    seen.add(normalizedValue)
    return true
  })
}

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim()

  if (!text) {
    return null
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1] || text
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1) {
    return null
  }

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
  } catch {
    return null
  }
}

function inferFoodTypeFromText(value) {
  const text = normalizeText(value)
  const beverageKeywords = [
    'beverage',
    'drink',
    'soda',
    'cola',
    'sparkling',
    'juice',
    'water',
    'tea',
    'coffee',
    'energy drink',
    'sports drink',
  ]

  return beverageKeywords.some((keyword) => text.includes(keyword)) ? 'beverage' : 'solid'
}

function buildHeuristicStrategy(productSummary) {
  const normalizedName = normalizeText(productSummary?.name)
  const requiredFoodType = productSummary?.health?.foodType || inferFoodTypeFromText(productSummary?.name)
  const strategy = {
    ...DEFAULT_SWAP_STRATEGY,
    requiredFoodType,
  }

  if (normalizedName.includes('chicken')) {
    return {
      ...strategy,
      broadCategory: 'Chicken Breast',
      shelfQuery: 'boneless skinless chicken breast organic no antibiotics',
      productFamily: 'boneless skinless chicken breast',
      preferredAttributes: ['organic', 'no antibiotics ever', 'air chilled'],
      includeTerms: ['chicken', 'breast'],
      excludeTerms: ['nuggets', 'breaded', 'patty'],
    }
  }

  if (normalizedName.includes('cookie')) {
    return {
      ...strategy,
      broadCategory: 'Cookie',
      shelfQuery: 'low sugar cookie unsweetened whole grain',
      productFamily: 'cookie',
      preferredAttributes: ['low sugar', 'whole grain', 'organic'],
      includeTerms: ['cookie'],
      excludeTerms: ['mix', 'protein powder'],
    }
  }

  if (normalizedName.includes('cola') || normalizedName.includes('soda')) {
    return {
      ...strategy,
      broadCategory: 'Soda',
      shelfQuery: 'healthy soda low sugar no artificial sweetener',
      productFamily: normalizedName.includes('orange') ? 'orange soda' : 'cola soda',
      preferredAttributes: ['low sugar', 'zero sugar', 'natural flavors'],
      includeTerms: normalizedName.includes('orange') ? ['soda', 'orange'] : ['soda', 'cola'],
      excludeTerms: ['powder', 'mix', 'baking soda', 'energy mix'],
      requiredFoodType: 'beverage',
    }
  }

  if (normalizedName.includes('yogurt')) {
    return {
      ...strategy,
      broadCategory: 'Yogurt',
      shelfQuery: 'greek yogurt nonfat unsweetened low sugar',
      productFamily: 'yogurt',
      preferredAttributes: ['nonfat', 'low sugar', 'unsweetened'],
      includeTerms: ['yogurt'],
      excludeTerms: ['drink', 'candy'],
    }
  }

  return {
    ...strategy,
    broadCategory: productSummary?.name || DEFAULT_SWAP_STRATEGY.broadCategory,
    shelfQuery: `${productSummary?.name || 'healthy food'} healthier alternative`,
    productFamily: productSummary?.name || '',
    preferredAttributes: [],
    includeTerms: uniqueTerms(String(productSummary?.name || '').split(' ')).slice(0, 3),
    excludeTerms: [],
  }
}

function titleLooksRelevant(title, strategy) {
  const normalizedTitle = normalizeText(title)
  const includeTerms = uniqueTerms(strategy?.includeTerms)
  const excludeTerms = uniqueTerms(strategy?.excludeTerms)

  if (excludeTerms.some((term) => normalizedTitle.includes(term))) {
    return false
  }

  if (!includeTerms.length) {
    return true
  }

  return includeTerms.some((term) => normalizedTitle.includes(term))
}

function isArticleLikeTitle(title) {
  const normalizedTitle = normalizeText(title)
  const articleMarkers = [
    'best ',
    'top ',
    'healthiest',
    'ranked',
    'according to',
    'guide',
    'review',
    'reviews',
    'vs ',
    'versus',
    'roundup',
    'we found',
    'nutritionist',
    'list of',
  ]

  return articleMarkers.some((marker) => normalizedTitle.includes(marker))
}

function mapShoppingResult(result) {
  return {
    title: String(result?.title || '').trim(),
    link: String(result?.link || '').trim(),
    snippet: [result?.price, result?.delivery, result?.rating ? `Rating ${result.rating}` : '']
      .filter(Boolean)
      .join(' • '),
    source: String(result?.source || '').trim(),
    imageUrl: String(result?.imageUrl || '').trim(),
  }
}

function mapOrganicResult(result) {
  return {
    title: String(result?.title || '').trim(),
    link: String(result?.link || '').trim(),
    snippet: String(result?.snippet || '').trim(),
    source: String(result?.source || '').trim(),
  }
}

function dedupeResults(results) {
  const seen = new Set()

  return results.filter((result) => {
    const key = `${normalizeText(result.title)}::${result.link}`

    if (!result.title || !result.link || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function scoreAlternativeResult(result, strategy) {
  const searchableText = [result.title, result.snippet, result.source].filter(Boolean).join(' ')
  const normalizedText = normalizeText(searchableText)
  let score = 0

  if (titleLooksRelevant(result.title, strategy)) {
    score += 30
  }

  if (strategy.productFamily && normalizedText.includes(normalizeText(strategy.productFamily))) {
    score += 22
  }

  score += uniqueTerms(strategy.includeTerms).reduce(
    (count, term) => count + (normalizedText.includes(term) ? 8 : 0),
    0,
  )

  score += uniqueTerms(strategy.preferredAttributes).reduce(
    (count, term) => count + (normalizedText.includes(term) ? 14 : 0),
    0,
  )

  score -= uniqueTerms(strategy.excludeTerms).reduce(
    (count, term) => count + (normalizedText.includes(term) ? 20 : 0),
    0,
  )

  score -= uniqueTerms(strategy.avoidAttributes).reduce(
    (count, term) => count + (normalizedText.includes(term) ? 18 : 0),
    0,
  )

  if (isArticleLikeTitle(result.title)) {
    score -= 60
  }

  return score
}

function buildFallbackQueries(strategy) {
  const preferredAttributeQuery = uniqueTerms(strategy.preferredAttributes).slice(0, 2).join(' ')

  return uniqueStrings([
    [strategy.productFamily, preferredAttributeQuery].filter(Boolean).join(' '),
    [strategy.shelfQuery, preferredAttributeQuery].filter(Boolean).join(' '),
    [strategy.productFamily, ...strategy.includeTerms.slice(0, 2)].filter(Boolean).join(' '),
    [strategy.productFamily, 'healthy alternative'].filter(Boolean).join(' '),
  ]).slice(0, MAX_ALTERNATIVE_QUERIES)
}

export async function categorizeProduct(productSummary) {
  const cacheKey = normalizeText(productSummary?.name)
  if (productStrategyCache.has(cacheKey)) {
    return productStrategyCache.get(cacheKey)
  }

  let strategy

  try {
    const rawResponse = await generateText(`You are classifying a grocery product for healthier swap suggestions.

Return valid JSON only with this exact shape:
{
  "broadCategory": "string",
  "shelfQuery": "string",
  "productFamily": "string",
  "preferredAttributes": ["attr1", "attr2"],
  "avoidAttributes": ["attr1", "attr2"],
  "includeTerms": ["term1", "term2"],
  "excludeTerms": ["term1", "term2"],
  "requiredFoodType": "beverage or solid"
}

Rules:
- Keep the category tightly aligned to the retail shelf category, not a broad wellness category.
- The alternatives must be the same type of product a shopper would buy as a direct swap.
- For soda, keep it in soda. Do not drift to nuts, powders, baking ingredients, supplements, mixes, or snacks.
- "productFamily" should be the specific family such as "cola soda", "orange soda", "greek yogurt", "sandwich bread".
- "preferredAttributes" should include meaningful upgrade labels shoppers care about for the category, such as organic, nonfat, low sodium, no antibiotics ever, grass fed, pasture raised, vegetarian fed, wild caught, unsweetened, whole grain.
- "avoidAttributes" should include labels or product cues that make the swap worse or off-target for this product.
- For bread, keep it in bread. For yogurt, keep it in yogurt. For cereal, keep it in cereal.
- "includeTerms" should contain the most important product-type words that must appear in likely matches.
- "excludeTerms" should contain obvious off-category items to reject.
- "requiredFoodType" must be "beverage" or "solid".

Product:
- Name: ${productSummary.name}
- Brand: ${productSummary.brand}
- Ingredients: ${productSummary.ingredients}
- Nutri-Score: ${productSummary.health.grade.toUpperCase()}
- Current food type: ${productSummary.health.foodType}`)
    const parsed = extractJsonObject(rawResponse)

    if (!parsed) {
      strategy = buildHeuristicStrategy(productSummary)
    } else {
      strategy = {
        broadCategory: parsed.broadCategory || DEFAULT_SWAP_STRATEGY.broadCategory,
        shelfQuery: parsed.shelfQuery || DEFAULT_SWAP_STRATEGY.shelfQuery,
        productFamily: parsed.productFamily || DEFAULT_SWAP_STRATEGY.productFamily,
        preferredAttributes: uniqueTerms(parsed.preferredAttributes),
        avoidAttributes: uniqueTerms(parsed.avoidAttributes),
        includeTerms: uniqueTerms(parsed.includeTerms),
        excludeTerms: uniqueTerms(parsed.excludeTerms),
        requiredFoodType:
          parsed.requiredFoodType === 'beverage' || parsed.requiredFoodType === 'solid'
            ? parsed.requiredFoodType
            : DEFAULT_SWAP_STRATEGY.requiredFoodType,
      }
    }
  } catch {
    strategy = buildHeuristicStrategy(productSummary)
  }

  productStrategyCache.set(cacheKey, strategy)
  return strategy
}

export function generateAlternativeQueries(productSummary, strategy) {
  return uniqueStrings([
    [strategy.productFamily, ...strategy.preferredAttributes.slice(0, 2)]
      .filter(Boolean)
      .join(' '),
    [strategy.shelfQuery, ...strategy.preferredAttributes.slice(0, 2)]
      .filter(Boolean)
      .join(' '),
    [strategy.productFamily, ...strategy.includeTerms.slice(0, 2), 'healthy alternative']
      .filter(Boolean)
      .join(' '),
    [productSummary?.name, ...strategy.preferredAttributes.slice(0, 2)]
      .filter(Boolean)
      .join(' '),
  ]).slice(0, 4)
}

export async function searchSerperAlternatives(strategy, queries = []) {
  if (!SERPER_API_KEY) {
    throw new Error('Missing VITE_SERPER_API_KEY.')
  }

  const finalQueries = uniqueStrings(queries.length ? queries : buildFallbackQueries(strategy)).slice(
    0,
    4,
  )
  const aggregatedResults = []

  for (const query of finalQueries) {
    const shoppingResponse = await fetch(SERPER_SHOPPING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': SERPER_API_KEY,
      },
      body: JSON.stringify({
        q: query,
        num: 10,
      }),
    })

    if (shoppingResponse.ok) {
      const shoppingData = await shoppingResponse.json()
      aggregatedResults.push(
        ...(Array.isArray(shoppingData?.shopping) ? shoppingData.shopping : []).map(
          mapShoppingResult,
        ),
      )
    }

    const organicResponse = await fetch(SERPER_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': SERPER_API_KEY,
      },
      body: JSON.stringify({
        q: `${query} buy`,
        num: 10,
      }),
    })

    if (organicResponse.ok) {
      const organicData = await organicResponse.json()
      aggregatedResults.push(
        ...(Array.isArray(organicData?.organic) ? organicData.organic : []).map(mapOrganicResult),
      )
    }
  }

  return dedupeResults(
    aggregatedResults
      .filter((result) => !isArticleLikeTitle(result.title))
      .filter((result) => titleLooksRelevant(result.title, strategy))
      .sort(
        (left, right) =>
          scoreAlternativeResult(right, strategy) - scoreAlternativeResult(left, strategy),
      ),
  )
    .slice(0, MAX_CANDIDATE_RESULTS)
}

export function computeSwapDelta(candidateSummary, sourceResult, strategy) {
  const searchableText = [
    candidateSummary.name,
    candidateSummary.brand,
    candidateSummary.ingredients,
    sourceResult?.title,
    sourceResult?.snippet,
  ]
    .filter(Boolean)
    .join(' ')
  const normalizedText = normalizeText(searchableText)

  const preferredAttributeBonus = uniqueTerms(strategy.preferredAttributes).reduce(
    (score, term) => score + (normalizedText.includes(term) ? 4 : 0),
    0,
  )
  const avoidAttributePenalty = uniqueTerms(strategy.avoidAttributes).reduce(
    (score, term) => score + (normalizedText.includes(term) ? 5 : 0),
    0,
  )
  const familyBonus =
    strategy.productFamily && normalizedText.includes(normalizeText(strategy.productFamily)) ? 6 : 0

  return preferredAttributeBonus + familyBonus - avoidAttributePenalty
}

export async function rerankAlternatives(productSummary, strategy, candidates) {
  const deduped = []
  const seen = new Set()

  for (const candidate of candidates) {
    const key = normalizeText(`${candidate.brand} ${candidate.name}`)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(candidate)
  }

  return deduped
    .sort(
      (left, right) =>
        right.swapScore - left.swapScore ||
        right.globalHealth.totalScore - left.globalHealth.totalScore ||
        right.health.normalizedScore - left.health.normalizedScore,
    )
    .slice(0, 3)
}
