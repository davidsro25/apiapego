import Redis from 'ioredis'
import { config } from '../config'
import { logger } from '../utils/logger'

let redisClient: Redis | null = null

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    })

    redisClient.on('connect', () => logger.info('Redis connected'))
    redisClient.on('error', (err) => logger.error({ err }, 'Redis error'))
  }
  return redisClient
}

export async function testRedisConnection(): Promise<boolean> {
  try {
    const redis = getRedis()
    await redis.connect()
    await redis.ping()
    return true
  } catch (err) {
    logger.warn({ err }, 'Redis not available, running without cache')
    return false
  }
}

/** Cache com TTL em segundos */
export async function cacheSet(key: string, value: any, ttl?: number): Promise<void> {
  try {
    const redis = getRedis()
    const data = JSON.stringify(value)
    if (ttl) {
      await redis.setex(key, ttl, data)
    } else {
      await redis.set(key, data)
    }
  } catch { /* silently fail */ }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis()
    const data = await redis.get(key)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = getRedis()
    await redis.del(key)
  } catch { /* silently fail */ }
}
