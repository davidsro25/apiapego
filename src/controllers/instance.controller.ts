import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { InstanceService } from '../services/instance.service'
import { BaileysManager } from '../modules/instances/baileys.manager'
import { WebSocketServer } from '../modules/websocket/ws.server'

const createSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric'),
  webhookUrl: z.string().url().optional(),
  webhookEvents: z.array(z.string()).optional(),
  webhookEnabled: z.boolean().optional().default(true),
  provider: z.enum(['baileys', 'meta']).optional().default('baileys'),
  settings: z.object({
    rejectCalls: z.boolean().optional(),
    callRejectMessage: z.string().optional(),
    ignoreGroups: z.boolean().optional(),
    ignoreChannels: z.boolean().optional(),
    alwaysOnline: z.boolean().optional(),
    readMessages: z.boolean().optional(),
    readStatus: z.boolean().optional(),
    syncFullHistory: z.boolean().optional(),
    messageDelay: z.number().optional(),
    queueManager: z.boolean().optional(),
  }).optional(),
})

const webhookSchema = z.object({
  url: z.string().url().optional(),
  enabled: z.boolean().optional(),
  events: z.array(z.string()).optional(),
})

const settingsSchema = z.object({
  rejectCalls: z.boolean().optional(),
  callRejectMessage: z.string().optional(),
  ignoreGroups: z.boolean().optional(),
  ignoreChannels: z.boolean().optional(),
  alwaysOnline: z.boolean().optional(),
  readMessages: z.boolean().optional(),
  readStatus: z.boolean().optional(),
  syncFullHistory: z.boolean().optional(),
  messageDelay: z.number().optional(),
  queueManager: z.boolean().optional(),
})

const subscriptionSchema = z.object({
  active: z.boolean(),
})

export const InstanceController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const instances = await InstanceService.list()
    return reply.send({ success: true, data: instances })
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createSchema.parse(request.body)
    const instance = await InstanceService.create(body)
    return reply.status(201).send({ success: true, data: instance })
  },

  async get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({ success: true, data: instance })
  },

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

  async qr(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })

    const { qr, status } = await InstanceService.getQr(request.params.id)
    return reply.send({ success: true, data: { qr, status } })
  },

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await InstanceService.delete(request.params.id)
    return reply.send({ success: true, message: 'Instance deleted' })
  },

  async logout(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await InstanceService.logout(request.params.id)
    return reply.send({ success: true, message: 'Instance logged out' })
  },

  async restart(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await InstanceService.restart(request.params.id)
    return reply.send({ success: true, message: 'Instance restarting' })
  },

  async setWebhook(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const body = webhookSchema.parse(request.body)
    const instance = await InstanceService.updateWebhook(request.params.id, body)
    return reply.send({ success: true, data: instance })
  },

  async getWebhook(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({
      success: true,
      data: {
        url: instance.webhook_url,
        enabled: instance.webhook_enabled ?? true,
        events: instance.webhook_events,
      },
    })
  },

  async updateSettings(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const body = settingsSchema.parse(request.body)
    const instance = await InstanceService.updateSettings(request.params.id, body)
    return reply.send({ success: true, data: instance })
  },

  async getSettings(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({ success: true, data: instance.settings })
  },

  async updateSubscription(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { active } = subscriptionSchema.parse(request.body)
    const instance = await InstanceService.updateSubscription(request.params.id, active)
    return reply.send({ success: true, data: { subscriptionActive: instance.subscription_active } })
  },

  async getGroups(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groups = await BaileysManager.getGroups(instance.id)
    return reply.send({ success: true, data: groups })
  },

  async getGroupParticipants(
    request: FastifyRequest<{ Params: { id: string; groupId: string } }>,
    reply: FastifyReply
  ) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groupId = request.params.groupId.includes('@g.us')
      ? request.params.groupId
      : `${request.params.groupId}@g.us`

    const participants = await BaileysManager.getGroupParticipants(instance.id, groupId)
    return reply.send({ success: true, data: participants })
  },

  async getLabels(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const labels = await BaileysManager.getLabels(instance.id)
    return reply.send({ success: true, data: labels })
  },
}
