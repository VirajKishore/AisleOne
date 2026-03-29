const STOP_WORDS = new Set([
  'and',
  'drink',
  'food',
  'fl',
  'fluid',
  'for',
  'fresh',
  'from',
  'in',
  'natural',
  'of',
  'oz',
  'original',
  'pack',
  'the',
  'with',
])

const VARIANT_KEYWORDS = [
  'diet',
  'zero',
  'cherry',
  'vanilla',
  'mini',
  'light',
  'max',
  'classic',
  'caffeine free',
]

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token))
}

function extractSizes(value) {
  const normalized = normalizeText(value)
  const matches = normalized.match(/\b\d+(?:\.\d+)?\s?(?:oz|ml|l|lb|g|kg|fl oz)\b/g)
  return matches || []
}

function countOverlap(queryTokens, candidateTokens) {
  const candidateSet = new Set(candidateTokens)
  return queryTokens.reduce((count, token) => count + (candidateSet.has(token) ? 1 : 0), 0)
}

function variantPenalty(query, candidate) {
  return VARIANT_KEYWORDS.reduce((penalty, keyword) => {
    const queryHasKeyword = query.includes(keyword)
    const candidateHasKeyword = candidate.includes(keyword)

    if (queryHasKeyword === candidateHasKeyword) {
      return penalty
    }

    return penalty + 8
  }, 0)
}

function getCandidateText(food) {
  return [food?.description, food?.brandName, food?.brandOwner, food?.packageWeight]
    .filter(Boolean)
    .join(' ')
}

function scoreMatch(query, food) {
  const normalizedQuery = normalizeText(query)
  const candidateText = getCandidateText(food)
  const normalizedCandidate = normalizeText(candidateText)
  const queryTokens = tokenize(query)
  const candidateTokens = tokenize(candidateText)
  const overlapCount = countOverlap(queryTokens, candidateTokens)
  const querySizes = extractSizes(query)
  const candidateSizes = extractSizes(candidateText)
  const sizeMatches = querySizes.filter((size) => candidateSizes.includes(size)).length
  const description = normalizeText(food?.description)
  const brand = normalizeText(food?.brandName || food?.brandOwner)

  let score = 0

  if (description === normalizedQuery) {
    score += 120
  } else if (normalizedCandidate === normalizedQuery) {
    score += 100
  }

  if (description.startsWith(normalizedQuery)) {
    score += 40
  } else if (normalizedCandidate.startsWith(normalizedQuery)) {
    score += 25
  }

  if (normalizedCandidate.includes(normalizedQuery)) {
    score += 20
  }

  score += overlapCount * 12

  if (queryTokens.length > 0) {
    score += Math.round((overlapCount / queryTokens.length) * 30)
  }

  if (brand && queryTokens.some((token) => brand.includes(token))) {
    score += 15
  }

  score += sizeMatches * 10
  score -= variantPenalty(normalizedQuery, normalizedCandidate)

  if (food?.gtinUpc && normalizedQuery === String(food.gtinUpc).trim()) {
    score += 150
  }

  return score
}

export function rankUsdaMatches(query, foods, limit = 5) {
  return [...(Array.isArray(foods) ? foods : [])]
    .map((food) => ({
      ...food,
      matchScore: scoreMatch(query, food),
    }))
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, limit)
}
