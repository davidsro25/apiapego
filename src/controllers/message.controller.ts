import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { MessageService } from '../services/message.service'
import { InstanceService } from '../services/instance.service'

// Campo destino: 'to' em todos os envios, 'phone' no check
const toBase = z.object({
  to: z.string().min(8),
})

const textSchema = toBase.extend({
  text: z.string().min(1).max(4096),
  quoted: z.string().optional(),
})

const imageSchema = toBase.extend({
  image: z.string().min(1),
  caption: z.string().optional(),
})

const videoSchema = toBase.extend({
  video: z.string().min(1),
  caption: z.string().optional(),
})

const audioSchema = toBase.extend({
  audio: z.string().min(1),
  ptt: z.boolean().optional().default(false),
})

const documentSchema = toBase.extend({
  document: z.string().min(1),
  filename: z.string(),
  mimetype: z.string().optional(),
})

const locationSchema = toBase.extend({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
})

const contactSchema = toBase.extend({
  contactName: z.string().min(1),
  contactPhone: z.string().min(8),
})

const stickerSchema = toBase.extend({
  sticker: z.string().min(1),
})

const reactionSchema = toBase.extend({
  messageId: z.string().min(1),
  emoji: z.string().min(1),
})

const buttonsSchema = toBase.extend({
  text: z.string().min(1).max(1024),
  footer: z.string().optional().default(''),
  buttons: z.array(z.object({
    id: z.string(),
    text: z.string(),
  })).min(1).max(3),
})

const listSchema = toBase.extend({
  title: z.string().min(1),
  text: z.string().min(1),
  footer: z.string().optional().default(''),
  buttonText: z.string().default('Ver opções'),
  sections: z.array(z.object({
    title: z.string(),
    rows: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
    })).min(1),
  })).min(1),
})

const pollSchema = toBase.extend({
  name: z.string().min(1).max(255),
  values: z.array(z.string().min(1)).min(2).max(12),
  selectableCount: z.number().min(0).max(12).optional().default(1),
})

const carouselSchema = toBase.extend({
  cards: z.array(z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    footer: z.string().optional(),
    image: z.string().optional(),
    buttons: z.array(z.object({
      id: z.string(),
      text: z.string(),
      url: z.string().optional(),
    })).min(1).max(3),
  })).min(1).max(10),
})

const deleteSchema = z.object({
  to: z.string().min(8),
  messageId: z.string().min(1),
  forEveryone: z.boolean().optional().default(true),
})

const editSchema = z.object({
  to: z.string().min(8),
  messageId: z.string().min(1),
  text: z.string().min(1).max(4096),
})

const readSchema = z.object({
  keys: z.array(z.object({
    remoteJid: z.string().min(1),
    id: z.string().min(1),
    fromMe: z.boolean().optional(),
  })).min(1),
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
    const { to, text, quoted } = textSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendText(inst.id, to, text)
    return reply.send(result)
  },

  async sendImage(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, image, caption } = imageSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendImage(inst.id, to, image, caption)
    return reply.send(result)
  },

  async sendVideo(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, video, caption } = videoSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendVideo(inst.id, to, video, caption)
    return reply.send(result)
  },

  async sendAudio(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, audio, ptt } = audioSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendAudio(inst.id, to, audio, ptt)
    return reply.send(result)
  },

  async sendDocument(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, document, filename, mimetype } = documentSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendDocument(inst.id, to, document, filename, mimetype)
    return reply.send(result)
  },

  async sendLocation(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, latitude, longitude, name } = locationSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendLocation(inst.id, to, latitude, longitude, name)
    return reply.send(result)
  },

  async sendContact(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, contactName, contactPhone } = contactSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendContact(inst.id, to, contactName, contactPhone)
    return reply.send(result)
  },

  async sendSticker(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, sticker } = stickerSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendSticker(inst.id, to, sticker)
    return reply.send(result)
  },

  async sendReaction(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, messageId, emoji } = reactionSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendReaction(inst.id, to, messageId, emoji)
    return reply.send(result)
  },

  async sendButtons(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, text, footer, buttons } = buttonsSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendButtons(inst.id, to, text, footer, buttons)
    return reply.send(result)
  },

  async sendList(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, title, text, footer, buttonText, sections } = listSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendList(inst.id, to, title, text, footer, buttonText, sections)
    return reply.send(result)
  },

  async sendPoll(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, name, values, selectableCount } = pollSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendPoll(inst.id, to, name, values, selectableCount)
    return reply.send(result)
  },

  async sendCarousel(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, cards } = carouselSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.sendCarousel(inst.id, to, cards)
    return reply.send(result)
  },

  async deleteMessage(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, messageId, forEveryone } = deleteSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.deleteMessage(inst.id, to, messageId, forEveryone)
    return reply.send(result)
  },

  async editMessage(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { to, messageId, text } = editSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.editMessage(inst.id, to, messageId, text)
    return reply.send(result)
  },

  async readMessages(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { keys } = readSchema.parse(request.body)
    const inst = await getInstance(request.params.id)
    const result = await MessageService.readMessages(inst.id, keys)
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
