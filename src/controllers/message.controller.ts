import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { MessageService } from '../services/message.service'
import { InstanceService } from '../services/instance.service'

// Schemas de validação
const phoneBase = z.object({
  phone: z.string().min(8),
})

const textSchema = phoneBase.extend({
  text: z.string().min(1).max(4096),
})

const imageSchema = phoneBase.extend({
  image: z.string().min(1), // URL ou base64
  caption: z.string().optional(),
})

const videoSchema = phoneBase.extend({
  video: z.string().url(),
  caption: z.string().optional(),
})

const audioSchema = phoneBase.extend({
  audio: z.string().url(),
  ptt: z.boolean().optional().default(false),
})

const documentSchema = phoneBase.extend({
  document: z.string().url(),
  filename: z.string(),
  mimetype: z.string().optional(),
})

const locationSchema = phoneBase.extend({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
})

const contactSchema = phoneBase.extend({
  contactName: z.string().min(1),
  contactPhone: z.string().min(8),
})

const stickerSchema = phoneBase.extend({
  sticker: z.string().url(),
})

const reactionSchema = phoneBase.extend({
  messageId: z.string().min(1),
  emoji: z.string().min(1),
})

const checkSchema = z.object({
  phone: z.string().min(8),
})

// Helper para pegar instanceId validado
async function getInstance(id: string) {
  const instance = await InstanceService.get(id)
  if (!instance) throw new Error('Instance not found')
  if (instance.status !== 'connected') throw new Error(`Instance is ${instance.status}`)
  return instance
}

export const MessageController = {
  async sendText(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, text } = textSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendText(inst.id, phone, text)
    return reply.send(result)
  },

  async sendImage(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, image, caption } = imageSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendImage(inst.id, phone, image, caption)
    return reply.send(result)
  },

  async sendVideo(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, video, caption } = videoSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendVideo(inst.id, phone, video, caption)
    return reply.send(result)
  },

  async sendAudio(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, audio, ptt } = audioSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendAudio(inst.id, phone, audio, ptt)
    return reply.send(result)
  },

  async sendDocument(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, document, filename, mimetype } = documentSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendDocument(inst.id, phone, document, filename, mimetype)
    return reply.send(result)
  },

  async sendLocation(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, latitude, longitude, name } = locationSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendLocation(inst.id, phone, latitude, longitude, name)
    return reply.send(result)
  },

  async sendContact(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, contactName, contactPhone } = contactSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendContact(inst.id, phone, contactName, contactPhone)
    return reply.send(result)
  },

  async sendSticker(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, sticker } = stickerSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendSticker(inst.id, phone, sticker)
    return reply.send(result)
  },

  async sendReaction(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, messageId, emoji } = reactionSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendReaction(inst.id, phone, messageId, emoji)
    return reply.send(result)
  },

  async checkNumber(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone } = checkSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.checkNumber(inst.id, phone)
    return reply.send({ success: true, data: result })
  },

  async listMessages(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { phone?: string; limit?: string; offset?: string } }>,
    reply: FastifyReply
  ) {
    const inst = await InstanceService.get(request.params.id)
    if (!inst) return reply.status(404).send({ error: 'Instance not found' })

    const limit = parseInt(request.query.limit || '50')
    const offset = parseInt(request.query.offset || '0')

    const messages = await MessageService.listMessages(inst.id, request.query.phone, limit, offset)
    return reply.send({ success: true, data: messages })
  },
}
