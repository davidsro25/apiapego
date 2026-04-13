import { FastifyInstance } from 'fastify'
import { MessageController } from '../controllers/message.controller'

const TAG = ['Messages']
const instanceIdParam = {
  type: 'object',
  properties: { id: { type: 'string', description: 'ID ou nome da instância' } },
}
const toField = { to: { type: 'string', description: 'Número com DDI (ex: 5511999999999)', example: '5511999999999' } }

export async function messageRoutes(app: FastifyInstance) {
  app.post('/:id/check-number', {
    schema: {
      tags: TAG, summary: 'Verificar número no WhatsApp', params: instanceIdParam,
      body: { type: 'object', required: ['number'], properties: { number: { type: 'string', example: '5511999999999' } } },
    },
  }, MessageController.checkNumber)

  app.get('/:id/messages', {
    schema: {
      tags: TAG, summary: 'Listar mensagens', params: instanceIdParam,
      querystring: { type: 'object', properties: { limit: { type: 'integer', default: 50 }, offset: { type: 'integer', default: 0 } } },
    },
  }, MessageController.listMessages)

  app.post('/:id/send-text', {
    schema: {
      tags: TAG, summary: 'Enviar texto', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'text'], properties: { ...toField, text: { type: 'string', example: 'Olá! Tudo bem?' } } },
    },
  }, MessageController.sendText)

  app.post('/:id/send-image', {
    schema: {
      tags: TAG, summary: 'Enviar imagem', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'image'], properties: { ...toField, image: { type: 'string', description: 'URL ou base64' }, caption: { type: 'string' } } },
    },
  }, MessageController.sendImage)

  app.post('/:id/send-video', {
    schema: {
      tags: TAG, summary: 'Enviar vídeo', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'video'], properties: { ...toField, video: { type: 'string', description: 'URL ou base64' }, caption: { type: 'string' } } },
    },
  }, MessageController.sendVideo)

  app.post('/:id/send-audio', {
    schema: {
      tags: TAG, summary: 'Enviar áudio', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'audio'], properties: { ...toField, audio: { type: 'string', description: 'URL ou base64' } } },
    },
  }, MessageController.sendAudio)

  app.post('/:id/send-document', {
    schema: {
      tags: TAG, summary: 'Enviar documento', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'document'], properties: { ...toField, document: { type: 'string' }, filename: { type: 'string' }, mimetype: { type: 'string' } } },
    },
  }, MessageController.sendDocument)

  app.post('/:id/send-location', {
    schema: {
      tags: TAG, summary: 'Enviar localização', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'latitude', 'longitude'], properties: { ...toField, latitude: { type: 'number' }, longitude: { type: 'number' }, name: { type: 'string' } } },
    },
  }, MessageController.sendLocation)

  app.post('/:id/send-contact', {
    schema: {
      tags: TAG, summary: 'Enviar contato', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'contactName', 'contactPhone'], properties: { ...toField, contactName: { type: 'string' }, contactPhone: { type: 'string' } } },
    },
  }, MessageController.sendContact)

  app.post('/:id/send-sticker', {
    schema: {
      tags: TAG, summary: 'Enviar sticker', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'sticker'], properties: { ...toField, sticker: { type: 'string', description: 'URL ou base64' } } },
    },
  }, MessageController.sendSticker)

  app.post('/:id/send-reaction', {
    schema: {
      tags: TAG, summary: 'Enviar reação', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'messageId', 'emoji'], properties: { ...toField, messageId: { type: 'string' }, emoji: { type: 'string', example: '👍' } } },
    },
  }, MessageController.sendReaction)
}
