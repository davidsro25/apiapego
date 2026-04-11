import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../database/db'
import { cacheDel } from '../database/redis'

const createKeySchema = z.object({
  name: z.string().min(2).max(100),
})

export async function keysRoutes(app: FastifyInstance) {
  // Listar API keys
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const keys = await query('SELECT id, name, active, created_at FROM api_keys ORDER BY created_at DESC')
    return reply.send({ success: true, data: keys })
  })

  // Criar API key
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = createKeySchema.parse(request.body)
    const key = `apego_${uuidv4().replace(/-/g, '')}`

    const [created] = await query(
      'INSERT INTO api_keys (key, name) VALUES ($1, $2) RETURNING id, key, name, active, created_at',
      [key, name]
    )
    return reply.status(201).send({ success: true, data: created })
  })

  // Revogar API key
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const key = await queryOne<{ key: string }>(
      'SELECT key FROM api_keys WHERE id = $1', [request.params.id]
    )
    if (!key) return reply.status(404).send({ error: 'Key not found' })

    await query('UPDATE api_keys SET active = false WHERE id = $1', [request.params.id])
    await cacheDel(`apikey:${key.key}`)

    return reply.send({ success: true, message: 'Key revoked' })
  })
}
