import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { config } from '../config'
import { WebhookDispatcher } from '../modules/webhook/webhook.dispatcher'
import { WebSocketServer } from '../modules/websocket/ws.server'
import { query, queryOne } from '../database/db'
import { logger } from '../utils/logger'
import axios from 'axios'

/**
 * Controller para integração com Meta Cloud API (WhatsApp Business API Oficial)
 * Suporta instâncias do tipo "meta" que se comunicam via API da Meta
 * ao invés de Baileys.
 */

const sendTextSchema = z.object({
  phone: z.string().min(8),
  text: z.string().min(1).max(4096),
})

const sendTemplateSchema = z.object({
  phone: z.string().min(8),
  templateName: z.string().min(1),
  languageCode: z.string().default('pt_BR'),
  components: z.array(z.any()).optional(),
})

export const MetaController = {
  /**
   * GET /api/meta/webhook
   * Verificação do webhook pela Meta (GET com token de verificação)
   */
  async verifyWebhook(
    request: FastifyRequest<{
      Querystring: { 'hub.mode': string; 'hub.verify_token': string; 'hub.challenge': string }
    }>,
    reply: FastifyReply
  ) {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = request.query

    if (mode === 'subscribe' && token === config.meta.verifyToken) {
      logger.info('Meta webhook verified')
      return reply.status(200).send(challenge)
    }

    return reply.status(403).send({ error: 'Forbidden' })
  },

  /**
   * POST /api/meta/webhook
   * Recebe eventos da Meta (mensagens, status, etc.)
   */
  async receiveWebhook(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any

    // Responde 200 imediatamente para a Meta não retentar
    reply.status(200).send('OK')

    if (body.object !== 'whatsapp_business_account') return

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value

        // Encontra a instância Meta pelo número de telefone (phone_number_id)
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        const instance = await queryOne<{ id: string }>(
          "SELECT id FROM instances WHERE phone = $1 AND provider = 'meta'",
          [phoneNumberId]
        )

        if (!instance) {
          logger.warn({ phoneNumberId }, 'Meta webhook: instance not found')
          continue
        }

        // Processa mensagens
        for (const msg of value?.messages || []) {
          const payload = {
            id: msg.id,
            remoteJid: `${msg.from}@s.whatsapp.net`,
            fromMe: false,
            type: msg.type,
            content: msg[msg.type] || {},
            timestamp: parseInt(msg.timestamp),
            pushName: value.contacts?.[0]?.profile?.name,
          }

          await WebSocketServer.broadcast(instance.id, { event: 'message', data: payload })
          await WebhookDispatcher.dispatch(instance.id, 'messages', { event: 'received', message: payload })

          logger.info({ instanceId: instance.id, msgId: msg.id }, 'Meta message received')
        }

        // Processa status de entrega
        for (const status of value?.statuses || []) {
          const payload = { messageId: status.id, status: status.status, timestamp: status.timestamp }
          await WebSocketServer.broadcast(instance.id, { event: 'message_status', data: payload })
          await WebhookDispatcher.dispatch(instance.id, 'status', payload)
        }
      }
    }
  },

  /**
   * POST /api/instances/:id/meta/send-text
   * Envia texto via Meta Cloud API
   */
  async sendText(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, text } = sendTextSchema.parse(request.body)

    const instance = await queryOne<{ phone: string; api_key: string }>(
      "SELECT phone, api_key FROM instances WHERE (id = $1 OR name = $1) AND provider = 'meta'",
      [request.params.id]
    )

    if (!instance) {
      return reply.status(404).send({ error: 'Meta instance not found' })
    }

    const token = instance.api_key // Para Meta, api_key é o access token
    const phoneNumberId = instance.phone

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone.replace(/\D/g, ''),
        type: 'text',
        text: { body: text },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )

    return reply.send({
      success: true,
      messageId: response.data.messages?.[0]?.id,
      remoteJid: `${phone}@s.whatsapp.net`,
      timestamp: Math.floor(Date.now() / 1000),
    })
  },

  /**
   * POST /api/instances/:id/meta/send-template
   * Envia template via Meta Cloud API
   */
  async sendTemplate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { phone, templateName, languageCode, components } = sendTemplateSchema.parse(request.body)

    const instance = await queryOne<{ phone: string; api_key: string }>(
      "SELECT phone, api_key FROM instances WHERE (id = $1 OR name = $1) AND provider = 'meta'",
      [request.params.id]
    )

    if (!instance) {
      return reply.status(404).send({ error: 'Meta instance not found' })
    }

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${instance.phone}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components || [],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${instance.api_key}`,
          'Content-Type': 'application/json',
        },
      }
    )

    return reply.send({
      success: true,
      messageId: response.data.messages?.[0]?.id,
      remoteJid: `${phone}@s.whatsapp.net`,
      timestamp: Math.floor(Date.now() / 1000),
    })
  },
}
