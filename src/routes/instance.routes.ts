import { FastifyInstance } from 'fastify'
import { InstanceController } from '../controllers/instance.controller'
import { WebSocketServer } from '../modules/websocket/ws.server'
import { BaileysManager } from '../modules/instances/baileys.manager'
import { InstanceService } from '../services/instance.service'

const TAG = ['Instances']
const idParam = {
  type: 'object',
  properties: { id: { type: 'string', description: 'ID ou nome da instância' } },
}
const idGroupParam = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'ID ou nome da instância' },
    groupId: { type: 'string', description: 'ID do grupo (ex: 120363xxxxxx@g.us)' },
  },
}

const WEBHOOK_EVENTS = [
  'messages', 'status', 'connection', 'qr',
  'reaction', 'groups', 'contacts', 'presence',
  'call', 'chats', 'labels', 'all',
]

export async function instanceRoutes(app: FastifyInstance) {
  // ─── INSTÂNCIAS ────────────────────────────────────────────────────────
  app.get('/', {
    schema: { tags: TAG, summary: 'Listar instâncias' },
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
          webhookEnabled: { type: 'boolean', default: true },
          webhookEvents: { type: 'array', items: { type: 'string', enum: WEBHOOK_EVENTS } },
          provider: { type: 'string', enum: ['baileys', 'meta'], default: 'baileys' },
          settings: { type: 'object' },
        },
      },
    },
  }, InstanceController.create)

  app.get('/:id', {
    schema: { tags: TAG, summary: 'Obter instância', params: idParam },
  }, InstanceController.get)

  app.get('/:id/status', {
    schema: { tags: TAG, summary: 'Status da instância', params: idParam },
  }, InstanceController.status)

  app.get('/:id/qr', {
    schema: { tags: TAG, summary: 'QR Code para conectar', params: idParam },
  }, InstanceController.qr)

  app.delete('/:id', {
    schema: { tags: TAG, summary: 'Deletar instância', params: idParam },
  }, InstanceController.delete)

  app.post('/:id/logout', {
    schema: { tags: TAG, summary: 'Logout (desconecta, mantém instância)', params: idParam },
  }, InstanceController.logout)

  app.post('/:id/restart', {
    schema: { tags: TAG, summary: 'Reiniciar instância', params: idParam },
  }, InstanceController.restart)

  // ─── WEBHOOK ───────────────────────────────────────────────────────────
  app.get('/:id/webhook', {
    schema: { tags: TAG, summary: 'Obter configuração do webhook', params: idParam },
  }, InstanceController.getWebhook)

  app.put('/:id/webhook', {
    schema: {
      tags: TAG,
      summary: 'Configurar webhook',
      params: idParam,
      body: {
        type: 'object',
        properties: {
          url: { type: 'string', example: 'https://meusite.com/webhook' },
          enabled: { type: 'boolean', description: 'Ativar ou desativar webhook' },
          events: {
            type: 'array',
            items: { type: 'string', enum: WEBHOOK_EVENTS },
            description: 'Eventos a receber. Use ["all"] para todos.',
          },
        },
      },
    },
  }, InstanceController.setWebhook)

  // ─── CONFIGURAÇÕES ──────────────────────────────────────────────────────
  app.get('/:id/settings', {
    schema: { tags: TAG, summary: 'Obter configurações da instância', params: idParam },
  }, InstanceController.getSettings)

  app.put('/:id/settings', {
    schema: {
      tags: TAG,
      summary: 'Atualizar configurações da instância',
      params: idParam,
      body: {
        type: 'object',
        properties: {
          rejectCalls: { type: 'boolean', description: 'Rejeitar chamadas automaticamente' },
          callRejectMessage: { type: 'string', description: 'Mensagem enviada ao rejeitar chamada' },
          ignoreGroups: { type: 'boolean', description: 'Ignorar mensagens de grupos' },
          ignoreChannels: { type: 'boolean', description: 'Ignorar mensagens de canais/newsletters' },
          alwaysOnline: { type: 'boolean', description: 'Manter status online permanentemente' },
          readMessages: { type: 'boolean', description: 'Marcar mensagens como lidas automaticamente' },
          readStatus: { type: 'boolean', description: 'Visualizar status automaticamente' },
          syncFullHistory: { type: 'boolean', description: 'Sincronizar histórico completo ao conectar' },
          messageDelay: { type: 'number', description: 'Delay em ms entre envios (rate limiting)' },
          queueManager: { type: 'boolean', description: 'Usar fila com rate limiting e retry automático' },
        },
      },
    },
  }, InstanceController.updateSettings)

  // ─── ASSINATURA ────────────────────────────────────────────────────────
  app.put('/:id/subscription', {
    schema: {
      tags: TAG,
      summary: 'Ativar ou desativar assinatura da instância',
      params: idParam,
      body: {
        type: 'object',
        required: ['active'],
        properties: {
          active: { type: 'boolean', description: 'true para ativar, false para desativar' },
        },
      },
    },
  }, InstanceController.updateSubscription)

  // ─── GRUPOS ────────────────────────────────────────────────────────────
  app.get('/:id/groups', {
    schema: { tags: TAG, summary: 'Listar grupos da instância', params: idParam },
  }, InstanceController.getGroups)

  app.get('/:id/groups/:groupId/participants', {
    schema: {
      tags: TAG,
      summary: 'Puxar contatos/participantes de um grupo',
      params: idGroupParam,
    },
  }, InstanceController.getGroupParticipants)

  // ─── LABELS ────────────────────────────────────────────────────────────
  app.get('/:id/labels', {
    schema: { tags: TAG, summary: 'Listar etiquetas (labels) da instância', params: idParam },
  }, InstanceController.getLabels)

  // ─── WEBSOCKET ────────────────────────────────────────────────────────
  app.get('/:id/ws', {
    websocket: true,
    schema: { tags: TAG, summary: 'WebSocket tempo real', params: idParam },
  }, async (socket, request: any) => {
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
      name: instance.name,
      status: BaileysManager.getStatus(instance.id),
    }))
  })
}
