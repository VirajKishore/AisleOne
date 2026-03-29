/* global process */
import dotenv from 'dotenv'
import { buildServer } from './server/app.js'

dotenv.config()

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

const server = buildServer()

try {
  await server.listen({ port, host })
  server.log.info(`API listening on http://${host}:${port}`)
  server.log.info(`Swagger docs available at http://${host}:${port}/docs`)
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
