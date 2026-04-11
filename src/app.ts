import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { config } from './config'
import { logger } from './utils/logger'
import { errorHandler } from './middlewares/error'
import { registerRoutes } from './routes'

export async function buildApp() {
  const app = Fastify({
    logger,
    trustProxy: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB para base64
  })

  // ============================================
  // PLUGINS
  // ============================================

  // CORS
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  })

  // Helmet (security headers)
  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  // Rate limit
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
    }),
  })

  // WebSocket
  await app.register(websocket)

  // ============================================
  // ERROR HANDLER
  // ============================================
  app.setErrorHandler(errorHandler)

  // ============================================
  // ROUTES
  // ============================================
  await registerRoutes(app)

  return app
}
