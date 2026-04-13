import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middlewares/auth'
import { instanceRoutes } from './instance.routes'
import { messageRoutes } from './message.routes'
import { metaRoutes } from './meta.routes'
import { keysRoutes } from './keys.routes'

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Status da API',
      security: [],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async () => ({
    status: 'ok',
    service: 'apiapego',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }))

  app.addHook('preHandler', async (request, reply) => {
    const publicPaths = ['/health', '/api/meta/webhook', '/docs']
    if (publicPaths.some((p) => request.url === p || request.url.startsWith(p + '/') || request.url.startsWith(p + '?'))) return
    if (request.url === '/docs') return
    await authMiddleware(request, reply)
  })

  app.register(instanceRoutes, { prefix: '/api/instances' })
  app.register(messageRoutes, { prefix: '/api/instances' })
  app.register(metaRoutes, { prefix: '/api/meta' })
  app.register(keysRoutes, { prefix: '/api/keys' })
}
