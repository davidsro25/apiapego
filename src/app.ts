import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { config } from './config'
import { errorHandler } from './middlewares/error'
import { registerRoutes } from './routes'

export async function buildApp() {
  const app = Fastify({
    // Fastify 5 aceita objeto de config, não instância Pino
    logger: {
      level: config.server.env === 'production' ? 'info' : 'debug',
      ...(config.server.env !== 'production'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard' },
            },
          }
        : {}),
      base: { service: 'apiapego' },
    },
    trustProxy: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB para base64
  })

  // ============================================
  // PLUGINS
  // ============================================

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  })

  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
    }),
  })

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
