import { FastifyInstance } from 'fastify'
import { InstanceController } from '../controllers/instance.controller'
import { WebSocketServer } from '../modules/websocket/ws.server'
import { BaileysManager } from '../modules/instances/baileys.manager'
import { InstanceService } from '../services/instance.service'

export async function instanceRoutes(app: FastifyInstance) {
  // Listar todas as instâncias
  app.get('/', InstanceController.list)

  // Criar instância
  app.post('/', InstanceController.create)

  // Obter instância por ID ou nome
  app.get('/:id', InstanceController.get)

  // Status da instância
  app.get('/:id/status', InstanceController.status)

  // QR Code
  app.get('/:id/qr', InstanceController.qr)

  // Deletar instância
  app.delete('/:id', InstanceController.delete)

  // Logout (desconecta mas mantém instância)
  app.post('/:id/logout', InstanceController.logout)

  // Restart
  app.post('/:id/restart', InstanceController.restart)

  // Webhook
  app.get('/:id/webhook', InstanceController.getWebhook)
  app.put('/:id/webhook', InstanceController.setWebhook)

  // Settings
  app.put('/:id/settings', InstanceController.updateSettings)

  // WebSocket - conexão em tempo real
  app.get('/:id/ws', { websocket: true }, async (socket, request: any) => {
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
