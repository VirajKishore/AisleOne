import { getApiEnv } from './env.js'

const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const USDA_FOOD_URL = 'https://api.nal.usda.gov/fdc/v1/food'

function getUsdaApiKey() {
  const apiKey = getApiEnv('USDA_API_KEY', 'VITE_USDA_API_KEY')
  if (!apiKey) {
    throw new Error('Missing USDA API key.')
  }

  return apiKey
}

async function searchFoods(query, pageSize = 1, pageNumber = 1) {
  const apiKey = getUsdaApiKey()
  const response = await fetch(`${USDA_SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      dataType: ['Branded'],
      pageSize,
      pageNumber,
    }),
  })

  if (response.status === 429) {
    throw new Error('USDA rate limit exceeded.')
  }

  if (response.status === 403) {
    throw new Error('Invalid USDA API key.')
  }

  if (!response.ok) {
    throw new Error(`USDA request failed (${response.status}).`)
  }

  const data = await response.json()
  return Array.isArray(data?.foods) ? data.foods : []
}

export async function getFoodByFdcId(fdcId) {
  const apiKey = getUsdaApiKey()
  const id = Number(fdcId)
  if (!Number.isFinite(id)) {
    throw new Error('Invalid FDC ID.')
  }

  const response = await fetch(`${USDA_FOOD_URL}/${id}?api_key=${encodeURIComponent(apiKey)}`)

  if (response.status === 429) {
    throw new Error('USDA rate limit exceeded.')
  }

  if (response.status === 403) {
    throw new Error('Invalid USDA API key.')
  }

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`USDA food detail failed (${response.status}).`)
  }

  return response.json()
}

/**
 * Normalise any UPC-A (12), EAN-13, or GTIN-14 string to a 14-digit GTIN-14.
 * USDA FoodData Central stores every barcode zero-padded to 14 digits.
 * UPC-A (12 digits) → prepend "00"  e.g. 049000028911 → 00049000028911
 * EAN-13 (13 digits) → prepend "0"  e.g. 5000112548167 → 05000112548167
 */
function normalizeToGtin14(gtin) {
  const digits = String(gtin).replace(/\D/g, '')
  if (digits.length >= 14) return digits.slice(-14)
  return digits.padStart(14, '0')
}

/**
 * Search by GTIN, then load full food by FDC ID so `foodNutrients` matches the detail
 * endpoint (complete panel) instead of abridged search-only nutrients.
 *
 * Strategy: try the raw GTIN first (works for products stored with 12-digit UPC-A),
 * then fall back to GTIN-14 zero-padded form if no result (USDA stores many products
 * with the 14-digit format).
 */
export async function findFoodByGtinDetailed(gtin) {
  const rawDigits = String(gtin).replace(/\D/g, '')
  const gtin14   = normalizeToGtin14(rawDigits)

  // Try raw first; only run the second search if it's a different string
  let foods = await searchFoods(rawDigits, 1, 1)
  if (foods.length === 0 && gtin14 !== rawDigits) {
    foods = await searchFoods(gtin14, 1, 1)
  }

  const searchHit = foods[0] || null
  if (!searchHit) {
    return { food: null, searchHit: null }
  }

  if (!searchHit.fdcId) {
    return { food: searchHit, searchHit }
  }

  try {
    const full = await getFoodByFdcId(searchHit.fdcId)
    if (full) {
      return {
        food: {
          ...searchHit,
          ...full,
          gtinUpc: full.gtinUpc ?? searchHit.gtinUpc,
          foodNutrients: full.foodNutrients ?? searchHit.foodNutrients,
        },
        searchHit,
      }
    }
  } catch {
    /* keep search hit */
  }

  return { food: searchHit, searchHit }
}

export async function findFoodByGtin(gtin) {
  const { food } = await findFoodByGtinDetailed(gtin)
  return food
}

export async function findFoodByTitle(title, pageSize = 8) {
  const foods = await searchFoods(title, pageSize, 1)
  return foods
}

export async function safeFindFoodByTitle(title, pageSize = 8) {
  try {
    return await findFoodByTitle(title, pageSize)
  } catch {
    return []
  }
}
