import { FastifyInstance } from 'fastify'
import { MessageController } from '../controllers/message.controller'

export async function messageRoutes(app: FastifyInstance) {
  // Verificar se número está no WhatsApp
  app.post('/:id/check-number', MessageController.checkNumber)

  // Listar mensagens
  app.get('/:id/messages', MessageController.listMessages)

  // Envio de mensagens
  app.post('/:id/send-text', MessageController.sendText)
  app.post('/:id/send-image', MessageController.sendImage)
  app.post('/:id/send-video', MessageController.sendVideo)
  app.post('/:id/send-audio', MessageController.sendAudio)
  app.post('/:id/send-document', MessageController.sendDocument)
  app.post('/:id/send-location', MessageController.sendLocation)
  app.post('/:id/send-contact', MessageController.sendContact)
  app.post('/:id/send-sticker', MessageController.sendSticker)
  app.post('/:id/send-reaction', MessageController.sendReaction)
}
