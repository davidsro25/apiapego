import { FastifyInstance } from 'fastify'
import { MessageController } from '../controllers/message.controller'

const TAG = ['Mensagens']
const TAG_INTERACTIVE = ['Mensagens Interativas']
const instanceIdParam = {
  type: 'object',
  properties: { id: { type: 'string', description: 'ID ou nome da instância' } },
}
const toField = { to: { type: 'string', description: 'Número com DDI (ex: 5511999999999)', example: '5511999999999' } }

export async function messageRoutes(app: FastifyInstance) {
  // ─── VERIFICAÇÃO ───────────────────────────────────────────────────────
  app.post('/:id/check-number', {
    schema: {
      tags: TAG, summary: 'Verificar número no WhatsApp', params: instanceIdParam,
      body: { type: 'object', required: ['phone'], properties: { phone: { type: 'string', example: '5511999999999', description: 'Número com DDI' } } },
    },
  }, MessageController.checkNumber)

  // ─── HISTÓRICO ─────────────────────────────────────────────────────────
  app.get('/:id/messages', {
    schema: {
      tags: TAG, summary: 'Listar mensagens', params: instanceIdParam,
      querystring: { type: 'object', properties: { phone: { type: 'string' }, limit: { type: 'integer', default: 50 }, offset: { type: 'integer', default: 0 } } },
    },
  }, MessageController.listMessages)

  // ─── ENVIO ─────────────────────────────────────────────────────────────
  app.post('/:id/send-text', {
    schema: {
      tags: TAG, summary: 'Enviar texto', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'text'], properties: { ...toField, text: { type: 'string', example: 'Olá! Tudo bem?' }, quoted: { type: 'string', description: 'ID da mensagem para citar' } } },
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
      body: { type: 'object', required: ['to', 'audio'], properties: { ...toField, audio: { type: 'string', description: 'URL ou base64' }, ptt: { type: 'boolean', description: 'Enviar como PTT (nota de voz)', default: false } } },
    },
  }, MessageController.sendAudio)

  app.post('/:id/send-document', {
    schema: {
      tags: TAG, summary: 'Enviar documento', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'document', 'filename'], properties: { ...toField, document: { type: 'string' }, filename: { type: 'string' }, mimetype: { type: 'string' } } },
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
      tags: TAG, summary: 'Enviar reação (emoji)', params: instanceIdParam,
      body: { type: 'object', required: ['to', 'messageId', 'emoji'], properties: { ...toField, messageId: { type: 'string' }, emoji: { type: 'string', example: '👍' } } },
    },
  }, MessageController.sendReaction)

  // ─── AÇÕES DE MENSAGEM ─────────────────────────────────────────────────
  app.post('/:id/delete-message', {
    schema: {
      tags: TAG, summary: 'Deletar mensagem', params: instanceIdParam,
      body: {
        type: 'object', required: ['to', 'messageId'],
        properties: {
          ...toField,
          messageId: { type: 'string', description: 'ID da mensagem a deletar' },
          forEveryone: { type: 'boolean', default: true, description: 'Deletar para todos ou apenas para você' },
        },
      },
    },
  }, MessageController.deleteMessage)

  app.post('/:id/edit-message', {
    schema: {
      tags: TAG, summary: 'Editar mensagem de texto', params: instanceIdParam,
      body: {
        type: 'object', required: ['to', 'messageId', 'text'],
        properties: {
          ...toField,
          messageId: { type: 'string', description: 'ID da mensagem a editar' },
          text: { type: 'string', description: 'Novo texto' },
        },
      },
    },
  }, MessageController.editMessage)

  app.post('/:id/read-messages', {
    schema: {
      tags: TAG, summary: 'Marcar mensagens como lidas', params: instanceIdParam,
      body: {
        type: 'object', required: ['keys'],
        properties: {
          keys: {
            type: 'array',
            description: 'Lista de chaves de mensagens para marcar como lidas',
            items: {
              type: 'object',
              required: ['remoteJid', 'id'],
              properties: {
                remoteJid: { type: 'string', example: '5511999999999@s.whatsapp.net' },
                id: { type: 'string', description: 'ID da mensagem' },
                fromMe: { type: 'boolean', default: false },
              },
            },
          },
        },
      },
    },
  }, MessageController.readMessages)

  // ─── INTERATIVOS ───────────────────────────────────────────────────────
  app.post('/:id/send-buttons', {
    schema: {
      tags: TAG_INTERACTIVE, summary: 'Enviar botões simples (máx 3)', params: instanceIdParam,
      body: {
        type: 'object', required: ['to', 'text', 'buttons'],
        properties: {
          ...toField,
          text: { type: 'string', description: 'Texto principal da mensagem' },
          footer: { type: 'string', description: 'Rodapé (opcional)' },
          buttons: {
            type: 'array', maxItems: 3,
            description: 'Lista de botões (máx 3)',
            items: {
              type: 'object',
              required: ['id', 'text'],
              properties: {
                id: { type: 'string', example: 'btn_1' },
                text: { type: 'string', example: 'Opção 1' },
              },
            },
          },
        },
      },
    },
  }, MessageController.sendButtons)

  app.post('/:id/send-list', {
    schema: {
      tags: TAG_INTERACTIVE, summary: 'Enviar lista de opções', params: instanceIdParam,
      body: {
        type: 'object', required: ['to', 'title', 'text', 'sections'],
        properties: {
          ...toField,
          title: { type: 'string', example: 'Cardápio' },
          text: { type: 'string', example: 'Escolha uma opção abaixo:' },
          footer: { type: 'string' },
          buttonText: { type: 'string', default: 'Ver opções' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'rows'],
              properties: {
                title: { type: 'string', example: 'Categoria 1' },
                rows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['id', 'title'],
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, MessageController.sendList)

  app.post('/:id/send-poll', {
    schema: {
      tags: TAG_INTERACTIVE, summary: 'Enviar enquete', params: instanceIdParam,
      body: {
        type: 'object', required: ['to', 'name', 'values'],
        properties: {
          ...toField,
          name: { type: 'string', example: 'Qual o melhor horário?' },
          values: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 12, example: ['Manhã', 'Tarde', 'Noite'] },
          selectableCount: { type: 'integer', minimum: 0, maximum: 12, default: 1, description: '0 = múltipla escolha ilimitada' },
        },
      },
    },
  }, MessageController.sendPoll)

  app.post('/:id/send-carousel', {
    schema: {
      tags: TAG_INTERACTIVE, summary: 'Enviar carrossel de cards', params: instanceIdParam,
      body: {
        type: 'object', required: ['to', 'cards'],
        properties: {
          ...toField,
          cards: {
            type: 'array', minItems: 1, maxItems: 10,
            description: 'Lista de cards do carrossel',
            items: {
              type: 'object',
              required: ['title', 'body', 'buttons'],
              properties: {
                title: { type: 'string', example: 'Produto 1' },
                body: { type: 'string', example: 'Descrição do produto' },
                footer: { type: 'string' },
                image: { type: 'string', description: 'URL da imagem do card' },
                buttons: {
                  type: 'array', minItems: 1, maxItems: 3,
                  items: {
                    type: 'object',
                    required: ['id', 'text'],
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                      url: { type: 'string', description: 'URL para botão de link' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, MessageController.sendCarousel)
}
