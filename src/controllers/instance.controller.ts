import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { InstanceService } from '../services/instance.service'
import { BaileysManager } from '../modules/instances/baileys.manager'
import { WebSocketServer } from '../modules/websocket/ws.server'

const createSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric'),
  webhookUrl: z.string().url().optional(),
  webhookEvents: z.array(z.enum(['messages', 'status', 'connection'])).optional(),
  provider: z.enum(['baileys', 'meta']).optional().default('baileys'),
  settings: z.object({
    rejectCalls: z.boolean().optional(),
    ignoreGroups: z.boolean().optional(),
    alwaysOnline: z.boolean().optional(),
    readMessages: z.boolean().optional(),
    syncFullHistory: z.boolean().optional(),
  }).optional(),
})

const webhookSchema = z.object({
  webhookUrl: z.string().url(),
  events: z.array(z.enum(['messages', 'status', 'connection'])).optional(),
})

const settingsSchema = z.object({
  rejectCalls: z.boolean().optional(),
  ignoreGroups: z.boolean().optional(),
  alwaysOnline: z.boolean().optional(),
  readMessages: z.boolean().optional(),
  syncFullHistory: z.boolean().optional(),
})

export const InstanceController = {
  // GET /api/instances
  async list(request: FastifyRequest, reply: FastifyReply) {
    const instances = await InstanceService.list()
    return reply.send({ success: true, data: instances })
  },

  // POST /api/instances
  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createSchema.parse(request.body)
    const instance = await InstanceService.create(body)
    return reply.status(201).send({ success: true, data: instance })
  },

  // GET /api/instances/:id
  async get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({ success: true, data: instance })
  },

  // GET /api/instances/:id/status
  async status(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })

    const status = BaileysManager.getStatus(instance.id)
    return reply.send({
      success: true,
      data: {
        instanceId: instance.id,
        name: instance.name,
        status,
        phone: instance.phone,
        profileName: instance.profile_name,
        wsConnections: WebSocketServer.getConnectionCount(instance.id),
      },
    })
  },

  // GET /api/instances/:id/qr
  async qr(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })

    const { qr, status } = await InstanceService.getQr(request.params.id)
    return reply.send({ success: true, data: { qr, status } })
  },

  // DELETE /api/instances/:id
  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await InstanceService.delete(request.params.id)
    return reply.send({ success: true, message: 'Instance deleted' })
  },

  // POST /api/instances/:id/logout
  async logout(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await InstanceService.logout(request.params.id)
    return reply.send({ success: true, message: 'Instance logged out' })
  },

  // POST /api/instances/:id/restart
  async restart(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await InstanceService.restart(request.params.id)
    return reply.send({ success: true, message: 'Instance restarting' })
  },

  // PUT /api/instances/:id/webhook
  async setWebhook(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const body = webhookSchema.parse(request.body)
    const instance = await InstanceService.updateWebhook(request.params.id, body.webhookUrl, body.events)
    return reply.send({ success: true, data: instance })
  },

  // GET /api/instances/:id/webhook
  async getWebhook(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({
      success: true,
      data: { webhookUrl: instance.webhook_url, events: instance.webhook_events },
    })
  },

  // PUT /api/instances/:id/settings
  async updateSettings(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const body = settingsSchema.parse(request.body)
    const instance = await InstanceService.updateSettings(request.params.id, body)
    return reply.send({ success: true, data: instance })
  },
}
