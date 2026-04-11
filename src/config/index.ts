import dotenv from 'dotenv'
dotenv.config()

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  auth: {
    globalApiKey: process.env.GLOBAL_API_KEY || 'changeme',
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'whaapi',
    password: process.env.POSTGRES_PASSWORD || 'whaapi123',
    database: process.env.POSTGRES_DB || 'whaapi',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  storage: {
    type: (process.env.STORAGE_TYPE || 'file') as 'file' | 'postgres',
    sessionsPath: process.env.SESSIONS_PATH || './sessions',
  },
  webhook: {
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '1000'),
  },
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
  },
  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN || '',
    appSecret: process.env.META_APP_SECRET || '',
  },
}
