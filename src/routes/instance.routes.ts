import { FastifyInstance } from 'fastify'
import { InstanceController } from '../controllers/instance.controller'
import { WebSocketServer } from '../modules/websocket/ws.server'
import { BaileysManager } from '../modules/instances/baileys.manager'
import { InstanceService } from '../services/instance.service'

const TAG = ['Instances']
const TAG_WEBHOOK = ['Webhook']
const TAG_WEBSOCKET = ['WebSocket']
const TAG_SETTINGS = ['Configurações']
const TAG_SUBSCRIPTION = ['Assinatura']
const TAG_PROXY = ['Proxy']
const TAG_PROFILE = ['Perfil']
const TAG_CONTACTS = ['Contatos']
const TAG_GROUPS = ['Grupos']
const TAG_LABELS = ['Labels']

const idParam = {
  type: 'object',
  properties: { id: { type: 'string', description: 'ID ou nome da instância' } },
}
const idGroupParam = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'ID ou nome da instância' },
    groupId: { type: 'string', description: 'ID do grupo (ex: 120363xxxxxx@g.us ou só o número)' },
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
          wsEvents: { type: 'array', items: { type: 'string', enum: WEBHOOK_EVENTS }, description: 'Eventos recebidos via WebSocket' },
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
    schema: { tags: TAG_WEBHOOK, summary: 'Obter configuração do webhook', params: idParam },
  }, InstanceController.getWebhook)

  app.put('/:id/webhook', {
    schema: {
      tags: TAG_WEBHOOK,
      summary: 'Configurar webhook (URL, ativar/desativar, eventos)',
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

  // ─── WEBSOCKET ────────────────────────────────────────────────────────
  app.get('/:id/websocket', {
    schema: { tags: TAG_WEBSOCKET, summary: 'Obter configuração do WebSocket', params: idParam },
  }, InstanceController.getWsConfig)

  app.put('/:id/websocket', {
    schema: {
      tags: TAG_WEBSOCKET,
      summary: 'Configurar eventos do WebSocket',
      params: idParam,
      body: {
        type: 'object',
        required: ['events'],
        properties: {
          events: {
            type: 'array',
            items: { type: 'string', enum: WEBHOOK_EVENTS },
            description: 'Eventos a receber via WebSocket. Use ["all"] para todos.',
          },
        },
      },
    },
  }, InstanceController.setWsConfig)

  app.get('/:id/ws', {
    websocket: true,
    schema: { tags: TAG_WEBSOCKET, summary: 'Conexão WebSocket persistente para eventos em tempo real', params: idParam },
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

  // ─── CONFIGURAÇÕES ──────────────────────────────────────────────────────
  app.get('/:id/settings', {
    schema: { tags: TAG_SETTINGS, summary: 'Obter configurações da instância', params: idParam },
  }, InstanceController.getSettings)

  app.put('/:id/settings', {
    schema: {
      tags: TAG_SETTINGS,
      summary: 'Atualizar configurações (Comportamento Automático)',
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
      tags: TAG_SUBSCRIPTION,
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

  // ─── PROXY ────────────────────────────────────────────────────────────
  app.get('/:id/proxy', {
    schema: { tags: TAG_PROXY, summary: 'Obter proxy da instância', params: idParam },
  }, InstanceController.getProxy)

  app.put('/:id/proxy', {
    schema: {
      tags: TAG_PROXY,
      summary: 'Configurar proxy da instância',
      params: idParam,
      body: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            nullable: true,
            example: 'http://user:pass@proxy.example.com:8080',
            description: 'Formatos: http://, https://, socks4://, socks5://. Null para remover.',
          },
        },
      },
    },
  }, InstanceController.setProxy)

  // ─── PERFIL ────────────────────────────────────────────────────────────
  app.get('/:id/profile/picture', {
    schema: {
      tags: TAG_PROFILE,
      summary: 'Obter foto de perfil',
      params: idParam,
      querystring: { type: 'object', properties: { phone: { type: 'string', description: 'Número para ver a foto (padrão: próprio número)' } } },
    },
  }, InstanceController.getProfilePicture)

  app.put('/:id/profile/picture', {
    schema: {
      tags: TAG_PROFILE,
      summary: 'Atualizar foto de perfil',
      params: idParam,
      body: {
        type: 'object',
        required: ['image'],
        properties: { image: { type: 'string', description: 'URL ou base64 da imagem' } },
      },
    },
  }, InstanceController.updateProfilePicture)

  app.put('/:id/profile/status', {
    schema: {
      tags: TAG_PROFILE,
      summary: 'Atualizar status/bio do perfil',
      params: idParam,
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', maxLength: 139, example: 'Disponível' } },
      },
    },
  }, InstanceController.updateProfileStatus)

  app.put('/:id/profile/name', {
    schema: {
      tags: TAG_PROFILE,
      summary: 'Atualizar nome do perfil',
      params: idParam,
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', maxLength: 25, example: 'Meu Nome' } },
      },
    },
  }, InstanceController.updateProfileName)

  // ─── CONTATOS ────────────────────────────────────────────────────────
  app.get('/:id/contacts', {
    schema: { tags: TAG_CONTACTS, summary: 'Listar contatos da instância', params: idParam },
  }, InstanceController.getContacts)

  app.get('/:id/contacts/blocked', {
    schema: { tags: TAG_CONTACTS, summary: 'Listar contatos bloqueados', params: idParam },
  }, InstanceController.getBlockedContacts)

  app.post('/:id/contacts/block', {
    schema: {
      tags: TAG_CONTACTS,
      summary: 'Bloquear ou desbloquear contato',
      params: idParam,
      body: {
        type: 'object',
        required: ['phone', 'action'],
        properties: {
          phone: { type: 'string', example: '5511999999999' },
          action: { type: 'string', enum: ['block', 'unblock'] },
        },
      },
    },
  }, InstanceController.blockContact)

  // ─── PRESENÇA ────────────────────────────────────────────────────────
  app.post('/:id/presence', {
    schema: {
      tags: TAG_CONTACTS,
      summary: 'Atualizar presença (digitando, gravando, etc.)',
      params: idParam,
      body: {
        type: 'object',
        required: ['to', 'type'],
        properties: {
          to: { type: 'string', example: '5511999999999' },
          type: { type: 'string', enum: ['available', 'unavailable', 'composing', 'recording', 'paused'] },
        },
      },
    },
  }, InstanceController.updatePresence)

  // ─── GRUPOS ────────────────────────────────────────────────────────────
  app.get('/:id/groups', {
    schema: { tags: TAG_GROUPS, summary: 'Listar grupos da instância', params: idParam },
  }, InstanceController.getGroups)

  app.post('/:id/groups', {
    schema: {
      tags: TAG_GROUPS,
      summary: 'Criar grupo',
      params: idParam,
      body: {
        type: 'object',
        required: ['name', 'participants'],
        properties: {
          name: { type: 'string', example: 'Meu Grupo' },
          participants: { type: 'array', items: { type: 'string' }, example: ['5511999999999'] },
        },
      },
    },
  }, InstanceController.createGroup)

  app.get('/:id/groups/:groupId', {
    schema: { tags: TAG_GROUPS, summary: 'Metadados do grupo', params: idGroupParam },
  }, InstanceController.getGroupMetadata)

  app.get('/:id/groups/:groupId/participants', {
    schema: { tags: TAG_GROUPS, summary: 'Puxar contatos/participantes de um grupo', params: idGroupParam },
  }, InstanceController.getGroupParticipants)

  app.get('/:id/groups/:groupId/invite', {
    schema: { tags: TAG_GROUPS, summary: 'Link de convite do grupo', params: idGroupParam },
  }, InstanceController.getGroupInviteLink)

  app.post('/:id/groups/:groupId/participants', {
    schema: {
      tags: TAG_GROUPS,
      summary: 'Gerenciar participantes (adicionar, remover, promover, rebaixar)',
      params: idGroupParam,
      body: {
        type: 'object',
        required: ['action', 'participants'],
        properties: {
          action: { type: 'string', enum: ['add', 'remove', 'promote', 'demote'] },
          participants: { type: 'array', items: { type: 'string' }, example: ['5511999999999'] },
        },
      },
    },
  }, InstanceController.updateGroupParticipants)

  app.put('/:id/groups/:groupId/settings', {
    schema: {
      tags: TAG_GROUPS,
      summary: 'Configurar grupo (nome, descrição, anúncio, restrito)',
      params: idGroupParam,
      body: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Nome do grupo' },
          description: { type: 'string', description: 'Descrição do grupo' },
          announce: { type: 'boolean', description: 'Somente admins enviam mensagens' },
          restrict: { type: 'boolean', description: 'Somente admins editam informações do grupo' },
        },
      },
    },
  }, InstanceController.updateGroupSettings)

  app.post('/:id/groups/:groupId/leave', {
    schema: { tags: TAG_GROUPS, summary: 'Sair do grupo', params: idGroupParam },
  }, InstanceController.leaveGroup)

  // ─── LABELS ────────────────────────────────────────────────────────────
  app.get('/:id/labels', {
    schema: { tags: TAG_LABELS, summary: 'Listar etiquetas (labels) da instância', params: idParam },
  }, InstanceController.getLabels)

  app.post('/:id/labels/manage', {
    schema: {
      tags: TAG_LABELS,
      summary: 'Adicionar ou remover etiqueta de um chat',
      params: idParam,
      body: {
        type: 'object',
        required: ['jid', 'labelId', 'action'],
        properties: {
          jid: { type: 'string', example: '5511999999999@s.whatsapp.net', description: 'JID do chat' },
          labelId: { type: 'string', example: '1', description: 'ID da etiqueta' },
          action: { type: 'string', enum: ['add', 'remove'] },
        },
      },
    },
  }, InstanceController.manageLabel)
}
