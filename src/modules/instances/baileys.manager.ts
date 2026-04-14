import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  ConnectionState,
  WAMessage,
  AnyMessageContent,
  MiscMessageGenerationOptions,
  proto,
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

const instances = new Map<string, InstanceInfo>()

export class BaileysManager {
  private static sessionsDir = config.storage.sessionsPath

  static async init() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
    }

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

        await query("UPDATE instances SET status = 'qr', updated_at = NOW() WHERE id = $1", [instanceId])

        logger.info({ instanceName }, 'QR Code generated')
        WebSocketServer.broadcast(instanceId, { event: 'qr', qr })
        WebhookDispatcher.dispatch(instanceId, 'qr', { event: 'qr', qr })
      }

      if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0] || ''
        const profileName = sock.user?.name || ''

        instances.set(instanceId, { ...inst!, status: 'connected', qr: undefined, retryCount: 0 })

        await query(
          "UPDATE instances SET status = 'connected', phone = $2, profile_name = $3, updated_at = NOW() WHERE id = $1",
          [instanceId, phone, profileName]
        )

        const instData = await queryOne<{ settings: Record<string, any> }>(
          'SELECT settings FROM instances WHERE id = $1', [instanceId]
        )
        const settings = instData?.settings || {}
        if (settings.alwaysOnline) {
          await sock.sendPresenceUpdate('available').catch(() => {})
        }

        logger.info({ instanceName, phone }, 'WhatsApp connected')
        WebSocketServer.broadcast(instanceId, { event: 'connection', status: 'connected', phone, profileName })
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
    // EVENT: Messages Received
    // ============================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      const instanceData = await queryOne<{ settings: Record<string, boolean> }>(
        'SELECT settings FROM instances WHERE id = $1', [instanceId]
      )
      const settings = instanceData?.settings || {}

      for (const msg of messages) {
        if (!msg.message) continue
        if (settings.ignoreGroups && msg.key.remoteJid?.endsWith('@g.us')) continue
        if (settings.ignoreChannels && msg.key.remoteJid?.includes('@newsletter')) continue

        await this.saveMessage(instanceId, msg)

        if (settings.readMessages && !msg.key.fromMe) {
          await sock.readMessages([msg.key]).catch(() => {})
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
        const payload = { messageId: update.key.id, remoteJid: update.key.remoteJid, status: update.update.status }
        WebSocketServer.broadcast(instanceId, { event: 'message_status', data: payload })
        WebhookDispatcher.dispatch(instanceId, 'status', payload)
      }
    })

    // ============================================
    // EVENT: Reactions
    // ============================================
    sock.ev.on('messages.reaction', async (reactions) => {
      for (const reaction of reactions) {
        const payload = {
          messageId: reaction.key.id,
          remoteJid: reaction.key.remoteJid,
          reaction: reaction.reaction,
        }
        WebSocketServer.broadcast(instanceId, { event: 'reaction', data: payload })
        WebhookDispatcher.dispatch(instanceId, 'reaction', payload)
      }
    })

    // ============================================
    // EVENT: Groups Update
    // ============================================
    sock.ev.on('groups.update', async (updates) => {
      for (const update of updates) {
        WebSocketServer.broadcast(instanceId, { event: 'group_update', data: update })
        WebhookDispatcher.dispatch(instanceId, 'groups', { event: 'group_updated', data: update })
      }
    })

    // ============================================
    // EVENT: Group Participants
    // ============================================
    sock.ev.on('group-participants.update', async (update) => {
      WebSocketServer.broadcast(instanceId, { event: 'group_participants', data: update })
      WebhookDispatcher.dispatch(instanceId, 'groups', { event: 'participants_update', data: update })
    })

    // ============================================
    // EVENT: Contacts Update
    // ============================================
    sock.ev.on('contacts.update', async (contacts) => {
      for (const contact of contacts) {
        WebSocketServer.broadcast(instanceId, { event: 'contact_update', data: contact })
        WebhookDispatcher.dispatch(instanceId, 'contacts', { event: 'contact_updated', data: contact })
      }
    })

    // ============================================
    // EVENT: Contacts Upsert (armazena em memória)
    // ============================================
    sock.ev.on('contacts.upsert', async (contacts) => {
      WebhookDispatcher.dispatch(instanceId, 'contacts', { event: 'contacts_upsert', count: contacts.length })
    })

    // ============================================
    // EVENT: Presence Update
    // ============================================
    sock.ev.on('presence.update', async (presence) => {
      WebSocketServer.broadcast(instanceId, { event: 'presence', data: presence })
      WebhookDispatcher.dispatch(instanceId, 'presence', presence)
    })

    // ============================================
    // EVENT: Calls
    // ============================================
    sock.ev.on('call', async (calls) => {
      const instData = await queryOne<{ settings: Record<string, any> }>(
        'SELECT settings FROM instances WHERE id = $1', [instanceId]
      )
      const settings = instData?.settings || {}

      for (const call of calls) {
        if (settings.rejectCalls && call.status === 'offer') {
          try {
            await sock.rejectCall(call.id, call.from)
            if (settings.callRejectMessage) {
              await sock.sendMessage(call.from, { text: settings.callRejectMessage })
            }
          } catch (err) {
            logger.error({ err }, 'Failed to reject call')
          }
        }
        const payload = { id: call.id, from: call.from, status: call.status, isVideo: call.isVideo }
        WebSocketServer.broadcast(instanceId, { event: 'call', data: payload })
        WebhookDispatcher.dispatch(instanceId, 'call', payload)
      }
    })

    // ============================================
    // EVENT: Chats Update
    // ============================================
    sock.ev.on('chats.update', async (updates) => {
      for (const update of updates) {
        WebSocketServer.broadcast(instanceId, { event: 'chat_update', data: update })
        WebhookDispatcher.dispatch(instanceId, 'chats', { event: 'chat_updated', data: update })
      }
    })

    // ============================================
    // EVENT: Labels
    // ============================================
    sock.ev.on('labels.association', async (association) => {
      WebSocketServer.broadcast(instanceId, { event: 'label_association', data: association })
      WebhookDispatcher.dispatch(instanceId, 'labels', { event: 'label_association', data: association })
    })

    sock.ev.on('labels.edit', async (labels) => {
      WebSocketServer.broadcast(instanceId, { event: 'label_edit', data: labels })
      WebhookDispatcher.dispatch(instanceId, 'labels', { event: 'label_edit', data: labels })
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
  // DELETE MESSAGE
  // ============================================
  static async deleteMessage(
    instanceId: string,
    jid: string,
    messageId: string,
    forEveryone: boolean
  ): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    const key: proto.IMessageKey = { remoteJid: jid, id: messageId, fromMe: true }
    if (forEveryone) {
      await inst.socket.sendMessage(jid, { delete: key })
    } else {
      await (inst.socket as any).chatModify({ clear: { messages: [{ id: messageId, fromMe: true, timestamp: 0 }] } }, jid)
    }
  }

  // ============================================
  // EDIT MESSAGE
  // ============================================
  static async editMessage(
    instanceId: string,
    jid: string,
    messageId: string,
    text: string
  ): Promise<proto.IWebMessageInfo | undefined> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    return inst.socket.sendMessage(jid, {
      text,
      edit: { remoteJid: jid, id: messageId, fromMe: true },
    } as any)
  }

  // ============================================
  // READ MESSAGES
  // ============================================
  static async readMessages(
    instanceId: string,
    keys: { remoteJid: string; id: string; fromMe?: boolean }[]
  ): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    await inst.socket.readMessages(keys.map(k => ({ ...k, participant: undefined })))
  }

  // ============================================
  // SEND BUTTONS
  // ============================================
  static async sendButtons(
    instanceId: string,
    jid: string,
    text: string,
    footer: string,
    buttons: { id: string; text: string }[]
  ): Promise<proto.IWebMessageInfo | undefined> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    return inst.socket.sendMessage(jid, {
      buttonsMessage: {
        contentText: text,
        footerText: footer,
        buttons: buttons.map(b => ({
          buttonId: b.id,
          buttonText: { displayText: b.text },
          type: 1,
        })),
        headerType: 1,
      },
    } as any)
  }

  // ============================================
  // SEND LIST
  // ============================================
  static async sendList(
    instanceId: string,
    jid: string,
    title: string,
    text: string,
    footer: string,
    buttonText: string,
    sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
  ): Promise<proto.IWebMessageInfo | undefined> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    return inst.socket.sendMessage(jid, {
      listMessage: {
        title,
        description: text,
        footerText: footer,
        buttonText,
        listType: 1,
        sections,
      },
    } as any)
  }

  // ============================================
  // SEND POLL
  // ============================================
  static async sendPoll(
    instanceId: string,
    jid: string,
    name: string,
    values: string[],
    selectableCount: number = 1
  ): Promise<proto.IWebMessageInfo | undefined> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    return inst.socket.sendMessage(jid, {
      poll: { name, values, selectableCount },
    })
  }

  // ============================================
  // SEND CAROUSEL (template buttons)
  // ============================================
  static async sendCarousel(
    instanceId: string,
    jid: string,
    cards: {
      title: string
      body: string
      footer?: string
      image?: string
      buttons: { id: string; text: string; url?: string }[]
    }[]
  ): Promise<proto.IWebMessageInfo | undefined> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')

    const carouselCards = cards.map(card => ({
      header: card.image
        ? { imageMessage: { url: card.image }, hasMediaAttachment: true }
        : undefined,
      body: { text: `*${card.title}*\n${card.body}` },
      footer: card.footer ? { text: card.footer } : undefined,
      buttons: card.buttons.map(b => ({
        buttonId: b.id,
        buttonText: { displayText: b.text },
        type: b.url ? 5 : 1,
        ...(b.url ? { urlButton: { displayText: b.text, url: b.url } } : {}),
      })),
    }))

    return inst.socket.sendMessage(jid, {
      carouselMessage: {
        cards: carouselCards,
      },
    } as any)
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
  // GET GROUPS
  // ============================================
  static async getGroups(instanceId: string): Promise<any[]> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    const groups = await inst.socket.groupFetchAllParticipating()
    return Object.values(groups).map((g: any) => ({
      id: g.id,
      subject: g.subject,
      desc: g.desc,
      owner: g.owner,
      size: g.participants?.length || 0,
      creation: g.creation,
    }))
  }

  // ============================================
  // GET GROUP METADATA
  // ============================================
  static async getGroupMetadata(instanceId: string, groupId: string): Promise<any> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    return inst.socket.groupMetadata(groupId)
  }

  // ============================================
  // GET GROUP PARTICIPANTS
  // ============================================
  static async getGroupParticipants(instanceId: string, groupId: string): Promise<any[]> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    const metadata = await inst.socket.groupMetadata(groupId)
    return metadata.participants.map((p: any) => ({
      id: p.id,
      phone: p.id.replace('@s.whatsapp.net', '').replace('@g.us', ''),
      isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
      isSuperAdmin: p.admin === 'superadmin',
    }))
  }

  // ============================================
  // CREATE GROUP
  // ============================================
  static async createGroup(
    instanceId: string,
    name: string,
    participants: string[]
  ): Promise<any> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    return inst.socket.groupCreate(name, participants)
  }

  // ============================================
  // GET GROUP INVITE LINK
  // ============================================
  static async getGroupInviteLink(instanceId: string, groupId: string): Promise<string> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    const code = await inst.socket.groupInviteCode(groupId)
    return code || ''
  }

  // ============================================
  // UPDATE GROUP PARTICIPANTS
  // ============================================
  static async updateGroupParticipants(
    instanceId: string,
    groupId: string,
    action: 'add' | 'remove' | 'promote' | 'demote',
    participants: string[]
  ): Promise<any> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    return inst.socket.groupParticipantsUpdate(groupId, participants, action)
  }

  // ============================================
  // UPDATE GROUP SETTINGS
  // ============================================
  static async updateGroupSettings(
    instanceId: string,
    groupId: string,
    settings: { announce?: boolean; restrict?: boolean; subject?: string; description?: string }
  ): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')

    if (settings.subject !== undefined) {
      await inst.socket.groupUpdateSubject(groupId, settings.subject)
    }
    if (settings.description !== undefined) {
      await inst.socket.groupUpdateDescription(groupId, settings.description)
    }
    if (settings.announce !== undefined) {
      await inst.socket.groupSettingUpdate(groupId, settings.announce ? 'announcement' : 'not_announcement')
    }
    if (settings.restrict !== undefined) {
      await inst.socket.groupSettingUpdate(groupId, settings.restrict ? 'locked' : 'unlocked')
    }
  }

  // ============================================
  // LEAVE GROUP
  // ============================================
  static async leaveGroup(instanceId: string, groupId: string): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    await inst.socket.groupLeave(groupId)
  }

  // ============================================
  // GET LABELS
  // ============================================
  static async getLabels(instanceId: string): Promise<any[]> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    try {
      const labels = await (inst.socket as any).getLabels?.()
      return labels || []
    } catch {
      return []
    }
  }

  // ============================================
  // MANAGE LABEL (add/remove to chat)
  // ============================================
  static async manageLabel(
    instanceId: string,
    jid: string,
    labelId: string,
    action: 'add' | 'remove'
  ): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    await (inst.socket as any).addChatLabel?.(jid, labelId)
  }

  // ============================================
  // GET PROFILE PICTURE
  // ============================================
  static async getProfilePicture(instanceId: string, jid: string): Promise<string | null> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    try {
      return await inst.socket.profilePictureUrl(jid, 'image') || null
    } catch {
      return null
    }
  }

  // ============================================
  // UPDATE PROFILE PICTURE
  // ============================================
  static async updateProfilePicture(instanceId: string, imageBase64: string): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    await inst.socket.updateProfilePicture(inst.socket.user!.id, buffer)
  }

  // ============================================
  // UPDATE PROFILE STATUS (bio)
  // ============================================
  static async updateProfileStatus(instanceId: string, status: string): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    await inst.socket.updateProfileStatus(status)
  }

  // ============================================
  // UPDATE PROFILE NAME
  // ============================================
  static async updateProfileName(instanceId: string, name: string): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    await inst.socket.updateProfileName(name)
    // Sync name in DB
    await query('UPDATE instances SET profile_name = $2, updated_at = NOW() WHERE id = $1', [instanceId, name])
  }

  // ============================================
  // GET CONTACTS
  // ============================================
  static async getContacts(instanceId: string): Promise<any[]> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    try {
      const store = (inst.socket as any).store
      if (store?.contacts) {
        return Object.values(store.contacts).map((c: any) => ({
          id: c.id,
          name: c.name || c.notify,
          phone: c.id?.replace('@s.whatsapp.net', ''),
        }))
      }
      return []
    } catch {
      return []
    }
  }

  // ============================================
  // GET BLOCKED CONTACTS
  // ============================================
  static async getBlockedContacts(instanceId: string): Promise<any[]> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    try {
      const blocked = await inst.socket.fetchBlocklist()
      return blocked.filter(Boolean).map((jid: string | undefined) => ({
        jid: jid || '',
        phone: (jid || '').replace('@s.whatsapp.net', ''),
      }))
    } catch {
      return []
    }
  }

  // ============================================
  // BLOCK / UNBLOCK CONTACT
  // ============================================
  static async blockContact(
    instanceId: string,
    jid: string,
    action: 'block' | 'unblock'
  ): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    await inst.socket.updateBlockStatus(jid, action)
  }

  // ============================================
  // SEND PRESENCE
  // ============================================
  static async sendPresence(instanceId: string, jid: string, type: string): Promise<void> {
    const inst = instances.get(instanceId)
    if (!inst?.socket) throw new Error('Instance not connected')
    await inst.socket.sendPresenceUpdate(type as any, jid)
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
  // GET ALL INSTANCES (for server status)
  // ============================================
  static getAllInstances(): InstanceInfo[] {
    return Array.from(instances.values()).map(i => ({
      id: i.id,
      name: i.name,
      status: i.status,
      retryCount: i.retryCount,
    }))
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
    if (m.pollCreationMessage) return 'poll'
    if (m.listMessage) return 'list'
    if (m.buttonsMessage) return 'buttons'
    return 'unknown'
  }

  private static getMessageContent(msg: WAMessage): Record<string, unknown> {
    const m = msg.message
    if (!m) return {}
    if (m.conversation) return { text: m.conversation }
    if (m.extendedTextMessage) return { text: m.extendedTextMessage.text, contextInfo: m.extendedTextMessage.contextInfo }
    if (m.imageMessage) return { caption: m.imageMessage.caption, url: m.imageMessage.url, mimetype: m.imageMessage.mimetype }
    if (m.videoMessage) return { caption: m.videoMessage.caption, url: m.videoMessage.url }
    if (m.audioMessage) return { url: m.audioMessage.url, duration: m.audioMessage.seconds, ptt: m.audioMessage.ptt }
    if (m.documentMessage) return { filename: m.documentMessage.fileName, url: m.documentMessage.url, mimetype: m.documentMessage.mimetype }
    if (m.locationMessage) return { lat: m.locationMessage.degreesLatitude, lng: m.locationMessage.degreesLongitude, name: m.locationMessage.name }
    if (m.reactionMessage) return { text: m.reactionMessage.text, key: m.reactionMessage.key }
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
