import { getApiEnv } from './env.js'

const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

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

export async function findFoodByGtin(gtin) {
  const foods = await searchFoods(gtin, 1, 1)
  return foods[0] || null
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
