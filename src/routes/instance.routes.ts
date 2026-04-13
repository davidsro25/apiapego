import { FastifyInstance } from 'fastify'
import { InstanceController } from '../controllers/instance.controller'
import { WebSocketServer } from '../modules/websocket/ws.server'
import { BaileysManager } from '../modules/instances/baileys.manager'
import { InstanceService } from '../services/instance.service'

const TAG = ['Instances']
const instanceIdParam = {
  type: 'object',
  properties: { id: { type: 'string', description: 'ID ou nome da instância' } },
}

export async function instanceRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: { tags: TAG, summary: 'Listar instâncias', response: { 200: { type: 'object' } } },
  }, InstanceController.list)

  app.post('/', {
    schema: {
      tags: TAG,
      summary: 'Criar instância',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'minha-instancia' },
          webhookUrl: { type: 'string', example: 'https://meusite.com/webhook' },
          settings: { type: 'object' },
        },
      },
    },
  }, InstanceController.create)

  app.get('/:id', {
    schema: { tags: TAG, summary: 'Obter instância', params: instanceIdParam },
  }, InstanceController.get)

  app.get('/:id/status', {
    schema: { tags: TAG, summary: 'Status da instância', params: instanceIdParam },
  }, InstanceController.status)

  app.get('/:id/qr', {
    schema: { tags: TAG, summary: 'QR Code para conectar', params: instanceIdParam },
  }, InstanceController.qr)

  app.delete('/:id', {
    schema: { tags: TAG, summary: 'Deletar instância', params: instanceIdParam },
  }, InstanceController.delete)

  app.post('/:id/logout', {
    schema: { tags: TAG, summary: 'Logout (desconecta, mantém instância)', params: instanceIdParam },
  }, InstanceController.logout)

  app.post('/:id/restart', {
    schema: { tags: TAG, summary: 'Reiniciar instância', params: instanceIdParam },
  }, InstanceController.restart)

  app.get('/:id/webhook', {
    schema: { tags: TAG, summary: 'Ver webhook configurado', params: instanceIdParam },
  }, InstanceController.getWebhook)

  app.put('/:id/webhook', {
    schema: {
      tags: TAG,
      summary: 'Configurar webhook',
      params: instanceIdParam,
      body: {
        type: 'object',
        properties: { url: { type: 'string' }, events: { type: 'array', items: { type: 'string' } } },
      },
    },
  }, InstanceController.setWebhook)

  app.put('/:id/settings', {
    schema: {
      tags: TAG,
      summary: 'Atualizar configurações',
      params: instanceIdParam,
      body: { type: 'object' },
    },
  }, InstanceController.updateSettings)

  app.get('/:id/ws', { websocket: true, schema: { tags: TAG, summary: 'WebSocket tempo real', params: instanceIdParam } }, async (socket, request: any) => {
    const id = request.params.id
    const instance = await InstanceService.get(id)
    if (!instance) {
      socket.send(JSON.stringify({ error: 'Instance not found' }))
      socket.close()
      return
    }
    WebSocketServer.register(instance.id, socket)
    socket.send(JSON.stringify({
      event: 'connected',
      instanceId: instance.id,
      status: BaileysManager.getStatus(instance.id),
    }))
  })
}
