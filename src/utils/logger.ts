import pino from 'pino'
import { config } from '../config'

// Logger standalone para uso nos services/modules (fora do Fastify)
export const logger = pino({
  level: config.server.env === 'production' ? 'info' : 'debug',
  transport: config.server.env !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'apiapego' },
})
