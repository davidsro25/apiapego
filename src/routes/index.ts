import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middlewares/auth'
import { instanceRoutes } from './instance.routes'
import { messageRoutes } from './message.routes'
import { metaRoutes } from './meta.routes'
import { keysRoutes } from './keys.routes'

export async function registerRoutes(app: FastifyInstance) {
  // Health check público
  app.get('/health', async () => ({
    status: 'ok',
    service: 'apiapego',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }))

  // Rotas protegidas por API Key
  app.addHook('preHandler', async (request, reply) => {
    // Rotas públicas: health check e webhooks Meta
    const publicPaths = ['/health', '/api/meta/webhook']
    if (publicPaths.some((p) => request.url === p || request.url.startsWith(p))) return

    await authMiddleware(request, reply)
  })

  // Instâncias e WhatsApp (Baileys)
  app.register(instanceRoutes, { prefix: '/api/instances' })

  // Mensagens (prefixo em /api/instances para manter compatibilidade com PAPI)
  app.register(messageRoutes, { prefix: '/api/instances' })

  // Meta Cloud API
  app.register(metaRoutes, { prefix: '/api/meta' })

  // Gerenciamento de API Keys
  app.register(keysRoutes, { prefix: '/api/keys' })
}
