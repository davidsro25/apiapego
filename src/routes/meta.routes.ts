import { FastifyInstance } from 'fastify'
import { MetaController } from '../controllers/meta.controller'

export async function metaRoutes(app: FastifyInstance) {
  // Verificação do webhook pela Meta (não requer autenticação)
  app.get('/webhook', { config: { public: true } }, MetaController.verifyWebhook)

  // Receber eventos da Meta (não requer autenticação - Meta usa verify_token)
  app.post('/webhook', { config: { public: true } }, MetaController.receiveWebhook)

  // Envio via Meta Cloud API (requer auth)
  app.post('/:id/send-text', MetaController.sendText)
  app.post('/:id/send-template', MetaController.sendTemplate)
}
