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
 * Search by GTIN, then load full food by FDC ID so `foodNutrients` matches the detail
 * endpoint (complete panel) instead of abridged search-only nutrients.
 */
export async function findFoodByGtinDetailed(gtin) {
  const foods = await searchFoods(gtin, 1, 1)
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
