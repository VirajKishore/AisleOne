import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { registerProductRoutes } from './routes/products.js'

export function buildServer() {
  const app = Fastify({
    logger: true,
  })

  app.register(swagger, {
    openapi: {
      info: {
        title: 'AisleOne API',
        description: 'GTIN-based nutrition, health score, and healthier swap lookup API.',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3000' }],
      tags: [{ name: 'products', description: 'Product lookup endpoints' }],
    },
  })

  app.register(swaggerUi, {
    routePrefix: '/docs',
  })

  app.get('/health', {
    schema: {
      tags: ['products'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
          },
        },
      },
    },
  }, async () => ({ ok: true }))

  app.register(registerProductRoutes, { prefix: '/api/v1/products' })

  return app
}
