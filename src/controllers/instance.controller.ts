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
  wsEvents: z.array(z.string()).optional(),
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

const proxySchema = z.object({
  url: z.string().nullable().optional(),
})

const wsConfigSchema = z.object({
  events: z.array(z.string()),
})

const profilePictureSchema = z.object({
  image: z.string().min(1),
})

const profileStatusSchema = z.object({
  status: z.string().min(1).max(139),
})

const profileNameSchema = z.object({
  name: z.string().min(1).max(25),
})

const blockSchema = z.object({
  phone: z.string().min(8),
  action: z.enum(['block', 'unblock']),
})

const groupCreateSchema = z.object({
  name: z.string().min(1).max(100),
  participants: z.array(z.string()).min(1),
})

const groupParticipantsSchema = z.object({
  action: z.enum(['add', 'remove', 'promote', 'demote']),
  participants: z.array(z.string()).min(1),
})

const groupSettingsSchema = z.object({
  announce: z.boolean().optional(),
  restrict: z.boolean().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
})

const labelManageSchema = z.object({
  jid: z.string().min(1),
  labelId: z.string().min(1),
  action: z.enum(['add', 'remove']),
})

const presenceSchema = z.object({
  to: z.string().min(8),
  type: z.enum(['available', 'unavailable', 'composing', 'recording', 'paused']),
})

function toJidGroup(groupId: string): string {
  return groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
}

function toJidContact(phone: string): string {
  if (phone.includes('@')) return phone
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

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

  // ─── WEBHOOK ───────────────────────────────────────────────────────────
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

  // ─── WEBSOCKET CONFIG ──────────────────────────────────────────────────
  async getWsConfig(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({
      success: true,
      data: {
        wsUrl: `/api/instances/${instance.name}/ws`,
        events: instance.ws_events || ['messages', 'connection', 'qr', 'presence', 'call'],
        activeConnections: WebSocketServer.getConnectionCount(instance.id),
      },
    })
  },

  async setWsConfig(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { events } = wsConfigSchema.parse(request.body)
    const instance = await InstanceService.updateWsConfig(request.params.id, events)
    return reply.send({
      success: true,
      data: { events: instance.ws_events },
    })
  },

  // ─── CONFIGURAÇÕES ──────────────────────────────────────────────────────
  async updateSettings(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const body = settingsSchema.parse(request.body)
    const instance = await InstanceService.updateSettings(request.params.id, body)
    return reply.send({ success: true, data: instance.settings })
  },

  async getSettings(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({ success: true, data: instance.settings })
  },

  // ─── ASSINATURA ────────────────────────────────────────────────────────
  async updateSubscription(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { active } = subscriptionSchema.parse(request.body)
    const instance = await InstanceService.updateSubscription(request.params.id, active)
    return reply.send({ success: true, data: { subscriptionActive: instance.subscription_active } })
  },

  // ─── PROXY ────────────────────────────────────────────────────────────
  async getProxy(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    return reply.send({
      success: true,
      data: { url: instance.proxy_url },
    })
  },

  async setProxy(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { url } = proxySchema.parse(request.body)
    const instance = await InstanceService.updateProxy(request.params.id, url ?? null)
    return reply.send({ success: true, data: { url: instance.proxy_url } })
  },

  // ─── PERFIL ────────────────────────────────────────────────────────────
  async getProfilePicture(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { phone?: string } }>,
    reply: FastifyReply
  ) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const jid = request.query.phone ? toJidContact(request.query.phone) : instance.phone + '@s.whatsapp.net'
    const url = await BaileysManager.getProfilePicture(instance.id, jid)
    return reply.send({ success: true, data: { url } })
  },

  async updateProfilePicture(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { image } = profilePictureSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    await BaileysManager.updateProfilePicture(instance.id, image)
    return reply.send({ success: true, message: 'Profile picture updated' })
  },

  async updateProfileStatus(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { status } = profileStatusSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    await BaileysManager.updateProfileStatus(instance.id, status)
    return reply.send({ success: true, message: 'Profile status updated' })
  },

  async updateProfileName(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { name } = profileNameSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    await BaileysManager.updateProfileName(instance.id, name)
    return reply.send({ success: true, message: 'Profile name updated' })
  },

  // ─── CONTATOS ────────────────────────────────────────────────────────
  async getContacts(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const contacts = await BaileysManager.getContacts(instance.id)
    return reply.send({ success: true, data: contacts })
  },

  async getBlockedContacts(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const blocked = await BaileysManager.getBlockedContacts(instance.id)
    return reply.send({ success: true, data: blocked })
  },

  async blockContact(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, action } = blockSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const jid = toJidContact(phone)
    await BaileysManager.blockContact(instance.id, jid, action)
    return reply.send({ success: true, message: `Contact ${action}ed` })
  },

  // ─── PRESENÇA ────────────────────────────────────────────────────────
  async updatePresence(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, type } = presenceSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const jid = toJidContact(to)
    await BaileysManager.sendPresence(instance.id, jid, type)
    return reply.send({ success: true, message: 'Presence updated' })
  },

  // ─── GRUPOS ────────────────────────────────────────────────────────────
  async getGroups(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groups = await BaileysManager.getGroups(instance.id)
    return reply.send({ success: true, data: groups })
  },

  async createGroup(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { name, participants } = groupCreateSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const jids = participants.map(toJidContact)
    const group = await BaileysManager.createGroup(instance.id, name, jids)
    return reply.status(201).send({ success: true, data: group })
  },

  async getGroupMetadata(
    request: FastifyRequest<{ Params: { id: string; groupId: string } }>,
    reply: FastifyReply
  ) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groupId = toJidGroup(request.params.groupId)
    const metadata = await BaileysManager.getGroupMetadata(instance.id, groupId)
    return reply.send({ success: true, data: metadata })
  },

  async getGroupParticipants(
    request: FastifyRequest<{ Params: { id: string; groupId: string } }>,
    reply: FastifyReply
  ) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groupId = toJidGroup(request.params.groupId)
    const participants = await BaileysManager.getGroupParticipants(instance.id, groupId)
    return reply.send({ success: true, data: participants })
  },

  async getGroupInviteLink(
    request: FastifyRequest<{ Params: { id: string; groupId: string } }>,
    reply: FastifyReply
  ) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groupId = toJidGroup(request.params.groupId)
    const code = await BaileysManager.getGroupInviteLink(instance.id, groupId)
    return reply.send({ success: true, data: { inviteLink: `https://chat.whatsapp.com/${code}`, code } })
  },

  async updateGroupParticipants(
    request: FastifyRequest<{ Params: { id: string; groupId: string } }>,
    reply: FastifyReply
  ) {
    const { action, participants } = groupParticipantsSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groupId = toJidGroup(request.params.groupId)
    const jids = participants.map(toJidContact)
    const result = await BaileysManager.updateGroupParticipants(instance.id, groupId, action, jids)
    return reply.send({ success: true, data: result })
  },

  async updateGroupSettings(
    request: FastifyRequest<{ Params: { id: string; groupId: string } }>,
    reply: FastifyReply
  ) {
    const settings = groupSettingsSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groupId = toJidGroup(request.params.groupId)
    await BaileysManager.updateGroupSettings(instance.id, groupId, settings)
    return reply.send({ success: true, message: 'Group settings updated' })
  },

  async leaveGroup(
    request: FastifyRequest<{ Params: { id: string; groupId: string } }>,
    reply: FastifyReply
  ) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const groupId = toJidGroup(request.params.groupId)
    await BaileysManager.leaveGroup(instance.id, groupId)
    return reply.send({ success: true, message: 'Left group' })
  },

  // ─── LABELS ────────────────────────────────────────────────────────────
  async getLabels(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    const labels = await BaileysManager.getLabels(instance.id)
    return reply.send({ success: true, data: labels })
  },

  async manageLabel(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { jid, labelId, action } = labelManageSchema.parse(request.body)
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send({ error: 'Instance not found' })
    if (instance.status !== 'connected') return reply.status(400).send({ error: `Instance is ${instance.status}` })

    await BaileysManager.manageLabel(instance.id, jid, labelId, action)
    return reply.send({ success: true, message: `Label ${action}ed to chat` })
  },
}
