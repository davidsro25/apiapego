import { FastifyRequest, FastifyReply } from 'fastify'
import { config } from '../config'
import { queryOne } from '../database/db'
import { cacheGet, cacheSet } from '../database/redis'

/**
 * Middleware de autenticação via x-api-key ou Authorization: Bearer
 * Aceita:
 * 1. GLOBAL_API_KEY - chave master do sistema
 * 2. API Keys por instância - criadas via /api/instances
 * 3. API Keys customizadas - gerenciadas via /api/keys
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey =
    (request.headers['x-api-key'] as string) ||
    request.headers.authorization?.replace('Bearer ', '')

  if (!apiKey) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'API key required' })
  }

  // 1. Verifica chave global master
  if (apiKey === config.auth.globalApiKey) return

  // 2. Verifica no cache Redis
  const cached = await cacheGet<boolean>(`apikey:${apiKey}`)
  if (cached === true) return

  // 3. Verifica no banco de dados (api_keys table)
  const keyRecord = await queryOne<{ active: boolean }>(
    'SELECT active FROM api_keys WHERE key = $1',
    [apiKey]
  )

  if (keyRecord?.active) {
    await cacheSet(`apikey:${apiKey}`, true, 300) // cache 5 min
    return
  }

  // 4. Verifica se é api_key de uma instância específica
  const instance = await queryOne<{ id: string }>(
    'SELECT id FROM instances WHERE api_key = $1',
    [apiKey]
  )

  if (instance) {
    await cacheSet(`apikey:${apiKey}`, true, 300)
    return
  }

  return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid API key' })
}
