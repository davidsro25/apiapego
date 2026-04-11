import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  ConnectionState,
  WAMessage,
  AnyMessageContent,
  MiscMessageGenerationOptions,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import path from 'path'
import fs from 'fs'
import { logger } from '../../utils/logger'
import { config } from '../../config'
import { query, queryOne } from '../../database/db'
import { WebhookDispatcher } from '../webhook/webhook.dispatcher'
import { WebSocketServer } from '../websocket/ws.server'

export interface InstanceInfo {
  id: string
  name: string
  status: 'connecting' | 'connected' | 'disconnected' | 'qr'
  qr?: string
  socket?: WASocket
  retryCount: number
}

// Mapa em memória de instâncias ativas
const instances = new Map<string, InstanceInfo>()

export class BaileysManager {
  private static sessionsDir = config.storage.sessionsPath

  static async init() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
    }

    // Reconecta instâncias que existiam antes de reiniciar
    const existing = await query<{ id: string; name: string; status: string }>(
      "SELECT id, name, status FROM instances WHERE status != 'disconnected' AND provider = 'baileys'"
    )

    for (const inst of existing) {
      logger.info({ name: inst.name }, 'Reconnecting instance on startup')
      await this.connect(inst.id, inst.name).catch((err) =>
        logger.error({ err, name: inst.name }, 'Failed to reconnect instance')
      )
    }
  }

  static async connect(instanceId: string, instanceName: string): Promise<void> {
    const sessionDir = path.join(this.sessionsDir, instanceName)
    fs.mkdirSync(sessionDir, { recursive: true })

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion()

    logger.info({ instanceName, version }, 'Starting Baileys connection')

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ module: 'baileys', instance: instanceName }) as any,
      browser: ['ApiApego', 'Chrome', '1.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      markOnlineOnConnect: true,
      syncFullHistory: false,
    })

    instances.set(instanceId, {
      id: instanceId,
      name: instanceName,
      status: 'connecting',
      socket: sock,
      retryCount: 0,
    })

    // ============================================
    // EVENT: Connection Update
    // ============================================
    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update
      const inst = instances.get(instanceId)

      if (qr && inst) {
        inst.qr = qr
        inst.status = 'qr'
        instances.set(instanceId, inst)

        await query(
          "UPDATE instances SET status = 'qr', updated_at = NOW() WHERE id = $1",
          [instanceId]
        )

        logger.info({ instanceName }, 'QR Code generated')
        WebSocketServer.broadcast(instanceId, { event: 'qr', qr })
        WebhookDispatcher.dispatch(instanceId, 'connection', { event: 'qr', qr })
      }

      if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0] || ''
        const profileName = sock.user?.name || ''

        instances.set(instanceId, { ...inst!, status: 'connected', qr: undefined, retryCount: 0 })

        await query(
          "UPDATE instances SET status = 'connected', phone = $2, profile_name = $3, updated_at = NOW() WHERE id = $1",
          [instanceId, phone, profileName]
        )

        logger.info({ instanceName, phone }, 'WhatsApp connected')
        WebSocketServer.broadcast(instanceId, { event: 'connection', status: 'connected', phone })
        WebhookDispatcher.dispatch(instanceId, 'connection', { event: 'connected', phone, profileName })
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
        const shouldReconnect = reason !== DisconnectReason.loggedOut

        instances.set(instanceId, { ...inst!, status: 'disconnected' })

        await query(
          "UPDATE instances SET status = $2, updated_at = NOW() WHERE id = $1",
          [instanceId, shouldReconnect ? 'connecting' : 'disconnected']
        )

        WebSocketServer.broadcast(instanceId, { event: 'connection', status: 'disconnected', reason })
        WebhookDispatcher.dispatch(instanceId, 'connection', { event: 'disconnected', reason })

        if (shouldReconnect && (inst?.retryCount || 0) < 5) {
          const retryDelay = Math.min(5000 * Math.pow(2, inst?.retryCount || 0), 60000)
          logger.info({ instanceName, reason, retryDelay }, 'Reconnecting...')

          setTimeout(() => {
            instances.delete(instanceId)
            this.connect(instanceId, instanceName)
          }, retryDelay)

          if (inst) {
            inst.retryCount = (inst.retryCount || 0) + 1
            instances.set(instanceId, inst)
          }
        } else {
          logger.warn({ instanceName, reason }, 'Logged out or max retries reached')
        }
      }
    })

    // ============================================
    // EVENT: Credentials Update
    // ============================================
    sock.ev.on('creds.update', saveCreds)

    // ============================================
    // EVENT: Messages
    // ============================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      const instanceData = await queryOne<{ settings: Record<string, boolean> }>(
        'SELECT settings FROM instances WHERE id = $1',
        [instanceId]
      )
      const settings = instanceData?.settings || {}

      for (const msg of messages) {
        if (!msg.message) continue
        if (settings.ignoreGroups && msg.key.remoteJid?.endsWith('@g.us')) continue

        await this.saveMessage(instanceId, msg)

        if (settings.readMessages && !msg.key.fromMe) {
          await sock.readMessages([msg.key])
        }

        const payload = this.formatMessage(msg)
        WebSocketServer.broadcast(instanceId, { event: 'message', data: payload })
        WebhookDispatcher.dispatch(instanceId, 'messages', { event: 'received', message: payload })
      }
    })

    // ============================================
    // EVENT: Message Status Update
    // ============================================
    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        const payload = { messageId: update.key.id, status: update.update.status }
        WebSocketServer.broadcast(instanceId, { event: 'message_status', data: payload })
        WebhookDispatcher.dispatch(instanceId, 'status', payload)
      }
    })
  }

  // ============================================
  // SEND MESSAGE
  // ============================================
  static async sendMessage(
    instanceId: string,
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions
  ) {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    if (inst.status !== 'connected') throw new Error(`Instance status: ${inst.status}`)
    return inst.socket.sendMessage(jid, content, options)
  }

  // ============================================
  // CHECK NUMBER ON WHATSAPP
  // ============================================
  static async checkNumber(instanceId: string, jid: string): Promise<boolean> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    const results = await inst.socket.onWhatsApp(jid)
    const result = Array.isArray(results) ? results[0] : undefined
    return (result as any)?.exists || false
  }

  // ============================================
  // GET QR CODE
  // ============================================
  static getQr(instanceId: string): string | null {
    return instances.get(instanceId)?.qr || null
  }

  // ============================================
  // GET STATUS
  // ============================================
  static getStatus(instanceId: string): string {
    return instances.get(instanceId)?.status || 'disconnected'
  }

  // ============================================
  // LOGOUT
  // ============================================
  static async logout(instanceId: string, instanceName: string): Promise<void> {
    const inst = instances.get(instanceId)
    if (inst?.socket) {
      try { await inst.socket.logout() } catch {}
    }

    instances.delete(instanceId)

    const sessionDir = path.join(this.sessionsDir, instanceName)
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true })
    }

    await query(
      "UPDATE instances SET status = 'disconnected', phone = NULL, updated_at = NOW() WHERE id = $1",
      [instanceId]
    )
  }

  // ============================================
  // DELETE INSTANCE
  // ============================================
  static async deleteInstance(instanceId: string, instanceName: string): Promise<void> {
    await this.logout(instanceId, instanceName).catch(() => {})
    instances.delete(instanceId)
  }

  // ============================================
  // GET SOCKET
  // ============================================
  static getSocket(instanceId: string): WASocket | undefined {
    return instances.get(instanceId)?.socket
  }

  // ============================================
  // SAVE MESSAGE TO DB
  // ============================================
  private static async saveMessage(instanceId: string, msg: WAMessage) {
    try {
      const type = this.getMessageType(msg)
      const content = this.getMessageContent(msg)

      await query(
        `INSERT INTO messages (instance_id, message_id, remote_jid, from_me, type, content, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          instanceId,
          msg.key.id,
          msg.key.remoteJid,
          msg.key.fromMe || false,
          type,
          JSON.stringify(content),
          new Date((msg.messageTimestamp as number) * 1000),
        ]
      )
    } catch (err) {
      logger.error({ err }, 'Failed to save message')
    }
  }

  private static getMessageType(msg: WAMessage): string {
    const m = msg.message
    if (!m) return 'unknown'
    if (m.conversation || m.extendedTextMessage) return 'text'
    if (m.imageMessage) return 'image'
    if (m.videoMessage) return 'video'
    if (m.audioMessage) return 'audio'
    if (m.documentMessage) return 'document'
    if (m.stickerMessage) return 'sticker'
    if (m.locationMessage) return 'location'
    if (m.contactMessage || m.contactsArrayMessage) return 'contact'
    if (m.reactionMessage) return 'reaction'
    return 'unknown'
  }

  private static getMessageContent(msg: WAMessage): Record<string, unknown> {
    const m = msg.message
    if (!m) return {}
    if (m.conversation) return { text: m.conversation }
    if (m.extendedTextMessage) return { text: m.extendedTextMessage.text }
    if (m.imageMessage) return { caption: m.imageMessage.caption, url: m.imageMessage.url }
    if (m.videoMessage) return { caption: m.videoMessage.caption, url: m.videoMessage.url }
    if (m.audioMessage) return { url: m.audioMessage.url, duration: m.audioMessage.seconds }
    if (m.documentMessage) return { filename: m.documentMessage.fileName, url: m.documentMessage.url }
    if (m.locationMessage) return { lat: m.locationMessage.degreesLatitude, lng: m.locationMessage.degreesLongitude }
    return {}
  }

  private static formatMessage(msg: WAMessage) {
    return {
      id: msg.key.id,
      remoteJid: msg.key.remoteJid,
      fromMe: msg.key.fromMe,
      type: this.getMessageType(msg),
      content: this.getMessageContent(msg),
      timestamp: msg.messageTimestamp,
      pushName: msg.pushName,
    }
  }
}
