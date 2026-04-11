import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { MetaController } from '../controllers/meta.controller'

export async function metaRoutes(app: FastifyInstance) {
  // Verificação do webhook pela Meta (pública - sem auth)
  app.get('/webhook', async (
    request: FastifyRequest<{
      Querystring: { 'hub.mode': string; 'hub.verify_token': string; 'hub.challenge': string }
    }>,
    reply: FastifyReply
  ) => MetaController.verifyWebhook(request, reply))

  // Receber eventos da Meta (pública)
  app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) =>
    MetaController.receiveWebhook(request, reply)
  )

  // Envio via Meta Cloud API (requer auth - tratado no hook global)
  app.post('/:id/send-text', MetaController.sendText)
  app.post('/:id/send-template', MetaController.sendTemplate)
}
