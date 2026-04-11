import { buildApp } from './app'
import { config } from './config'
import { logger } from './utils/logger'
import { testConnection } from './database/db'
import { testRedisConnection } from './database/redis'
import { runMigrations } from './database/migrate'
import { BaileysManager } from './modules/instances/baileys.manager'

async function main() {
  logger.info('Starting ApiApego WhatsApp API...')

  // 1. Conecta ao banco de dados
  const dbOk = await testConnection()
  if (!dbOk) {
    logger.error('Cannot connect to PostgreSQL. Exiting.')
    process.exit(1)
  }

  // 2. Roda migrations
  await runMigrations()

  // 3. Conecta ao Redis (opcional, não fatal)
  await testRedisConnection()

  // 4. Builda e inicia o app Fastify
  const app = await buildApp()

  // 5. Inicia o servidor
  await app.listen({
    port: config.server.port,
    host: config.server.host,
  })

  logger.info(`ApiApego API running on http://${config.server.host}:${config.server.port}`)
  logger.info(`Domain: https://apiapego.apego.app.br`)

  // 6. Reconecta instâncias WhatsApp em background
  BaileysManager.init().catch((err) =>
    logger.error({ err }, 'Failed to initialize Baileys instances')
  )

  // 7. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...')
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception')
    process.exit(1)
  })
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection')
  })
}

main()
