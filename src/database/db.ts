import { Pool } from 'pg'
import { config } from '../config'
import { logger } from '../utils/logger'

export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL pool error')
})

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] || null
}

export async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT 1')
    logger.info('PostgreSQL connected successfully')
    return true
  } catch (err) {
    logger.error({ err }, 'PostgreSQL connection failed')
    return false
  }
}
