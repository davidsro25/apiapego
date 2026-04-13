import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import { config } from './config'
import { errorHandler } from './middlewares/error'
import { registerRoutes } from "./routes"
import { dashboardRoutes } from "./routes/dashboard.routes"
import { qrPageRoutes } from "./routes/qr-page.routes"

export async function buildApp() {
  const app = Fastify({
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
    bodyLimit: 50 * 1024 * 1024,
    ajv: {
      customOptions: {
        strict: 'log',
        keywords: ['example'],
      },
    },
  })

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'ApiApego — WhatsApp API',
        description: 'API SaaS multi-instância para WhatsApp. Suporta Baileys (gratuito) e Meta Cloud API (WABA oficial). Autenticação via header x-api-key ou Bearer token.',
        version: '1.0.0',
        contact: { name: 'Apego Imóveis', email: 'dev@apego.app.br' },
      },
      servers: [
        { url: 'https://apiapego.apego.app.br', description: 'Produção' },
        { url: 'http://localhost:3000', description: 'Local' },
      ],
      components: {
        securitySchemes: {
          ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' },
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ ApiKeyHeader: [] }, { BearerAuth: [] }],
      tags: [
        { name: 'Health', description: 'Status da API' },
        { name: 'Instances', description: 'Gerenciamento de instâncias Baileys' },
        { name: 'Messages', description: 'Envio de mensagens via Baileys' },
        { name: 'Meta', description: 'Meta Cloud API (WABA oficial)' },
        { name: 'API Keys', description: 'Gerenciamento de chaves de acesso' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: false,
    transformSpecificationClone: true,
  })

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  })

  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
    }),
  })

  await app.register(websocket)
  await app.register(cookie)
  await app.register(formbody)

  app.setErrorHandler(errorHandler)

  // Rotas públicas (sem auth)
  await app.register(qrPageRoutes)
  await app.register(dashboardRoutes)

  await registerRoutes(app)

  return app
}
