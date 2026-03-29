/* global process */
export function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getApiEnv(primaryName, fallbackName) {
  return process.env[primaryName] || process.env[fallbackName] || ''
}
