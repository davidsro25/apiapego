import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { MetaController } from '../controllers/meta.controller'

const TAG = ['Meta']

export async function metaRoutes(app: FastifyInstance) {
  app.get('/webhook', {
    schema: { tags: TAG, summary: 'Verificação do webhook Meta (pública)', security: [] },
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) =>
    MetaController.verifyWebhook(request, reply))

  app.post('/webhook', {
    schema: { tags: TAG, summary: 'Receber eventos Meta (pública)', security: [] },
  }, async (request: FastifyRequest, reply: FastifyReply) =>
    MetaController.receiveWebhook(request, reply))

  app.post('/:id/send-text', {
    schema: {
      tags: TAG, summary: 'Enviar texto via Meta Cloud API',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object', required: ['to', 'text'],
        properties: { to: { type: 'string', example: '5511999999999' }, text: { type: 'string' } },
      },
    },
  }, MetaController.sendText)

  app.post('/:id/send-template', {
    schema: {
      tags: TAG, summary: 'Enviar template via Meta Cloud API',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object', required: ['to', 'template'],
        properties: {
          to: { type: 'string', example: '5511999999999' },
          template: { type: 'string', example: 'hello_world' },
          language: { type: 'string', example: 'pt_BR' },
          components: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  }, MetaController.sendTemplate)
}
