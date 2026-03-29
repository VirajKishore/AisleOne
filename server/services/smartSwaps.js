import { GoogleGenAI } from '@google/genai'
import { rankUsdaMatches } from '../../src/utils/rankUsdaMatches.js'
import { calculateProductHealth } from '../../src/utils/calculateProductHealth.js'
import { calculateGlobalHealthScore } from '../../src/utils/calculateGlobalHealthScore.js'
import { getApiEnv } from './env.js'
import { safeFindFoodByTitle } from './usda.js'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const SERPER_SEARCH_URL = 'https://google.serper.dev/search'
const SERPER_SHOPPING_URL = 'https://google.serper.dev/shopping'
const strategyCache = new Map()
const ARTICLE_PATTERNS = [
  'best ',
  'healthiest',
  'guide',
  'review',
  'reviews',
  'ranked',
  'according to',
  'shopping guide',
  'top ',
  'vs ',
  'blog',
  'article',
  'roundup',
  'we found',
]
const MIN_USDA_MATCH_SCORE = 25
const MAX_SERPER_RESULTS = 12
const MAX_SERPER_QUERIES = 3

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getGeminiClient() {
  const apiKey = getApiEnv('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY')
  if (!apiKey) {
    throw new Error('Missing Gemini API key.')
  }

  return new GoogleGenAI({ apiKey })
}

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim()
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

async function generateText(prompt) {
  const ai = getGeminiClient()
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  })

  return response?.text?.trim() || ''
}

function buildGenericFallback(productName) {
  return {
    category: String(productName || '').trim() || 'Packaged Food',
    searchKeywords: 'healthy minimally processed better',
  }
}

export async function classifyProductForSwaps(productName) {
  const cacheKey = normalizeText(productName)
  if (strategyCache.has(cacheKey)) {
    return strategyCache.get(cacheKey)
  }

  try {
    const rawResponse = await generateText(`You are a professional Food Scientist. Your goal is to map a user-provided food product name into a specific shopping taxonomy for healthier product discovery.

Output Format: Return a JSON object with two keys: category (a specific searchable string) and searchKeywords (a string of 3-4 health-focused modifiers).

Taxonomy Rules:
- category must be a concrete retail-searchable product type, not a brand and not a sentence.
- searchKeywords must be 3-4 concise modifier phrases suitable for shopping search.
- Prefer healthier replacement terms such as lower sugar, zero sugar, whole grain, sprouted, organic, unsweetened, low sodium, high protein, minimally processed, grass fed, air chilled, or no antibiotics when appropriate.
- Keep the category in the same product family as the input.
- Return JSON only.

Example Input: "Cadbury Mini Eggs"
Example Output: {"category": "Milk Chocolate Candy", "searchKeywords": "dark chocolate naturally sweetened non-GMO"}

Input: "${productName}"`)

    const parsed = extractJsonObject(rawResponse)
    const strategy = {
      category: String(parsed?.category || '').trim() || buildGenericFallback(productName).category,
      searchKeywords: String(parsed?.searchKeywords || '').trim() || buildGenericFallback(productName).searchKeywords,
    }

    strategyCache.set(cacheKey, strategy)
    return strategy
  } catch {
    const fallback = buildGenericFallback(productName)
    strategyCache.set(cacheKey, fallback)
    return fallback
  }
}

export async function findHealthierSwaps(category, searchKeywords) {
  const apiKey = getApiEnv('SERPER_API_KEY', 'VITE_SERPER_API_KEY')
  if (!apiKey) {
    throw new Error('Missing Serper API key.')
  }

  const commonHeaders = {
    'Content-Type': 'application/json',
    'X-API-KEY': apiKey,
  }
  const queries = [
    `healthy ${category} ${searchKeywords}`.trim(),
    `best ${category} ${searchKeywords}`.trim(),
    `${searchKeywords} ${category} brands`.trim(),
  ]
    .filter(Boolean)
    .filter((query, index, items) => items.indexOf(query) === index)
    .slice(0, MAX_SERPER_QUERIES)

  const shoppingResponses = await Promise.all(
    queries.map(async (query) => {
      const response = await fetch(SERPER_SHOPPING_URL, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({
          q: query,
          num: MAX_SERPER_RESULTS,
        }),
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return Array.isArray(data?.shopping)
        ? data.shopping.map((result) => ({
            title: String(result?.title || '').trim(),
            link: String(result?.link || '').trim(),
            source: String(result?.source || result?.store || '').trim(),
            price: String(result?.price || '').trim(),
          }))
        : []
    }),
  )

  const shoppingResults = shoppingResponses
    .flat()
    .filter((result, index, items) => (
      items.findIndex((candidate) => (
        normalizeText(candidate.title) === normalizeText(result.title)
        || candidate.link === result.link
      )) === index
    ))

  if (shoppingResults.length > 0) {
    return shoppingResults
  }

  const response = await fetch(SERPER_SEARCH_URL, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      q: queries[0] || `${category} ${searchKeywords}`.trim(),
      num: MAX_SERPER_RESULTS,
    }),
  })

  if (!response.ok) {
    throw new Error(`Serper request failed (${response.status}).`)
  }

  const data = await response.json()
  return Array.isArray(data?.organic)
    ? data.organic.map((result) => ({
        title: String(result?.title || '').trim(),
        link: String(result?.link || '').trim(),
        source: String(result?.source || '').trim(),
      }))
    : []
}

function isSameProduct(originalName, candidateTitle) {
  const normalizedOriginal = normalizeText(originalName)
  const normalizedCandidate = normalizeText(candidateTitle)

  return Boolean(normalizedOriginal) && normalizedOriginal === normalizedCandidate
}

function isArticleLikeResult(result) {
  const normalizedTitle = normalizeText(result?.title)
  const normalizedLink = normalizeText(result?.link)
  const normalizedSource = normalizeText(result?.source)

  return ARTICLE_PATTERNS.some((pattern) => {
    const normalizedPattern = normalizeText(pattern)
    return normalizedTitle.includes(normalizedPattern)
      || normalizedLink.includes(normalizedPattern)
      || normalizedSource.includes(normalizedPattern)
  })
}

function isLikelyProductLink(link) {
  const url = String(link || '').trim()
  if (!url) {
    return false
  }

  const normalizedLink = normalizeText(url)
  const productPathMarkers = [
    '/product',
    '/products',
    '/p/',
    '/dp/',
    '/gp/',
    '/shop/',
    '/item/',
    '/buy/',
    '/store/',
  ]
  const blockedMarkers = [
    '/blog',
    '/blogs',
    '/guide',
    '/guides',
    '/review',
    '/reviews',
    '/article',
    '/articles',
    '/news',
  ]

  if (blockedMarkers.some((marker) => url.toLowerCase().includes(marker))) {
    return false
  }

  if (productPathMarkers.some((marker) => url.toLowerCase().includes(marker))) {
    return true
  }

  return !ARTICLE_PATTERNS.some((pattern) => normalizedLink.includes(normalizeText(pattern)))
}

function scoreAlternativeFood(food) {
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
    },
  )

  return globalHealth.totalScore
}

export async function buildAlternativeProducts(product) {
  try {
    const { category, searchKeywords } = await classifyProductForSwaps(product.name)
    const serperResults = await findHealthierSwaps(category, searchKeywords)
    const filteredResults = serperResults.filter((result) => (
      result.title
      && !isArticleLikeResult(result)
      && isLikelyProductLink(result.link)
    ))

    const candidates = await Promise.all(
      filteredResults.slice(0, MAX_SERPER_RESULTS).map(async (result) => {
        const foods = await safeFindFoodByTitle(result.title, 8)
        const matchedFood = rankUsdaMatches(result.title, foods, 1)[0]

        if (!matchedFood || matchedFood.matchScore < MIN_USDA_MATCH_SCORE) {
          return null
        }

        const score = scoreAlternativeFood(matchedFood)
        return {
          fdcId: matchedFood.fdcId,
          title: matchedFood.description || result.title,
          score,
          link: result.link,
          relevanceScore: matchedFood.matchScore,
        }
      }),
    )

    return candidates
      .filter(Boolean)
      .filter((candidate) => (
        candidate.link
        && candidate.title
        && candidate.score > product.healthScore
        && !isSameProduct(product.name, candidate.title)
      ))
      .filter((candidate, index, items) => (
        items.findIndex((other) => (
          normalizeText(other.title) === normalizeText(candidate.title)
          || other.link === candidate.link
          || other.fdcId === candidate.fdcId
        )) === index
      ))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }

        return right.relevanceScore - left.relevanceScore
      })
      .slice(0, 3)
      .map(({ title, score, link }) => ({ title, score, link }))
  } catch {
    return []
  }
}
