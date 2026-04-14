import { BaileysManager } from '../modules/instances/baileys.manager'
import { toJid, isValidPhone, formatBrazilianPhone } from '../utils/phone'
import { query } from '../database/db'
import { logger } from '../utils/logger'
import { proto } from '@whiskeysockets/baileys'

export interface SendResult {
  success: boolean
  messageId: string
  remoteJid: string
  timestamp: number
}

export class MessageService {
  private static async resolveJid(instanceId: string, phone: string): Promise<string> {
    if (phone.includes('@')) return phone

    if (!isValidPhone(phone)) throw new Error('Numero invalido: ' + phone)

    const formatted = formatBrazilianPhone(phone)
    const jid = toJid(formatted)

    // Tenta verificar se o numero existe — se falhar tecnicamente, envia mesmo assim
    try {
      const exists = await BaileysManager.checkNumber(instanceId, jid)
      if (!exists) throw new Error('Numero ' + phone + ' nao esta no WhatsApp')
    } catch (err: any) {
      if (err.message?.includes('nao esta no WhatsApp') || err.message?.includes('not registered')) {
        throw err
      }
      logger.warn({ phone, jid, errMsg: err.message }, 'checkNumber falhou, tentando enviar mesmo assim')
    }

    return jid
  }

  private static buildResult(msg: proto.IWebMessageInfo | undefined): SendResult {
    return {
      success: true,
      messageId: msg?.key?.id || '',
      remoteJid: msg?.key?.remoteJid || '',
      timestamp: (msg?.messageTimestamp as number) || Math.floor(Date.now() / 1000),
    }
  }

  // ============================================
  // TEXT
  // ============================================
  static async sendText(instanceId: string, phone: string, text: string, quoted?: string): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendMessage(instanceId, jid, { text })
    return this.buildResult(msg)
  }

  // ============================================
  // IMAGE
  // ============================================
  static async sendImage(
    instanceId: string,
    phone: string,
    image: string,
    caption?: string
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)

    const isBase64 = image.startsWith('data:') || !image.startsWith('http')
    const content: any = isBase64
      ? { image: Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64'), caption }
      : { image: { url: image }, caption }

    const msg = await BaileysManager.sendMessage(instanceId, jid, content)
    return this.buildResult(msg)
  }

  // ============================================
  // VIDEO
  // ============================================
  static async sendVideo(
    instanceId: string,
    phone: string,
    video: string,
    caption?: string
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendMessage(instanceId, jid, {
      video: { url: video },
      caption,
    })
    return this.buildResult(msg)
  }

  // ============================================
  // AUDIO
  // ============================================
  static async sendAudio(
    instanceId: string,
    phone: string,
    audio: string,
    ptt: boolean = false
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendMessage(instanceId, jid, {
      audio: { url: audio },
      ptt,
      mimetype: 'audio/ogg; codecs=opus',
    })
    return this.buildResult(msg)
  }

  // ============================================
  // DOCUMENT
  // ============================================
  static async sendDocument(
    instanceId: string,
    phone: string,
    url: string,
    filename: string,
    mimetype?: string
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendMessage(instanceId, jid, {
      document: { url },
      fileName: filename,
      mimetype: mimetype || 'application/octet-stream',
    })
    return this.buildResult(msg)
  }

  // ============================================
  // LOCATION
  // ============================================
  static async sendLocation(
    instanceId: string,
    phone: string,
    latitude: number,
    longitude: number,
    name?: string
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendMessage(instanceId, jid, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude, name },
    })
    return this.buildResult(msg)
  }

  // ============================================
  // CONTACT
  // ============================================
  static async sendContact(
    instanceId: string,
    phone: string,
    contactName: string,
    contactPhone: string
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;type=VOICE;waid=${contactPhone.replace(/\D/g, '')}:+${contactPhone.replace(/\D/g, '')}\nEND:VCARD`

    const msg = await BaileysManager.sendMessage(instanceId, jid, {
      contacts: {
        displayName: contactName,
        contacts: [{ vcard }],
      },
    })
    return this.buildResult(msg)
  }

  // ============================================
  // STICKER
  // ============================================
  static async sendSticker(instanceId: string, phone: string, stickerUrl: string): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendMessage(instanceId, jid, {
      sticker: { url: stickerUrl },
    })
    return this.buildResult(msg)
  }

  // ============================================
  // REACTION
  // ============================================
  static async sendReaction(
    instanceId: string,
    phone: string,
    messageId: string,
    emoji: string
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendMessage(instanceId, jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    })
    return this.buildResult(msg)
  }

  // ============================================
  // BUTTONS
  // ============================================
  static async sendButtons(
    instanceId: string,
    phone: string,
    text: string,
    footer: string,
    buttons: { id: string; text: string }[]
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendButtons(instanceId, jid, text, footer, buttons)
    return this.buildResult(msg)
  }

  // ============================================
  // LIST
  // ============================================
  static async sendList(
    instanceId: string,
    phone: string,
    title: string,
    text: string,
    footer: string,
    buttonText: string,
    sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendList(instanceId, jid, title, text, footer, buttonText, sections)
    return this.buildResult(msg)
  }

  // ============================================
  // POLL
  // ============================================
  static async sendPoll(
    instanceId: string,
    phone: string,
    name: string,
    values: string[],
    selectableCount?: number
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendPoll(instanceId, jid, name, values, selectableCount)
    return this.buildResult(msg)
  }

  // ============================================
  // CAROUSEL
  // ============================================
  static async sendCarousel(
    instanceId: string,
    phone: string,
    cards: {
      title: string
      body: string
      footer?: string
      image?: string
      buttons: { id: string; text: string; url?: string }[]
    }[]
  ): Promise<SendResult> {
    const jid = await this.resolveJid(instanceId, phone)
    const msg = await BaileysManager.sendCarousel(instanceId, jid, cards)
    return this.buildResult(msg)
  }

  // ============================================
  // DELETE MESSAGE
  // ============================================
  static async deleteMessage(
    instanceId: string,
    phone: string,
    messageId: string,
    forEveryone: boolean = true
  ): Promise<{ success: boolean }> {
    const jid = phone.includes('@') ? phone : toJid(formatBrazilianPhone(phone))
    await BaileysManager.deleteMessage(instanceId, jid, messageId, forEveryone)
    return { success: true }
  }

  // ============================================
  // EDIT MESSAGE
  // ============================================
  static async editMessage(
    instanceId: string,
    phone: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const jid = phone.includes('@') ? phone : toJid(formatBrazilianPhone(phone))
    const msg = await BaileysManager.editMessage(instanceId, jid, messageId, text)
    return this.buildResult(msg)
  }

  // ============================================
  // READ MESSAGES
  // ============================================
  static async readMessages(
    instanceId: string,
    keys: { remoteJid: string; id: string; fromMe?: boolean }[]
  ): Promise<{ success: boolean }> {
    await BaileysManager.readMessages(instanceId, keys)
    return { success: true }
  }

  // ============================================
  // CHECK NUMBER
  // ============================================
  static async checkNumber(instanceId: string, phone: string): Promise<{ exists: boolean; jid: string }> {
    const formatted = formatBrazilianPhone(phone)
    const jid = toJid(formatted)
    const exists = await BaileysManager.checkNumber(instanceId, jid)
    return { exists, jid }
  }

  // ============================================
  // LIST MESSAGES
  // ============================================
  static async listMessages(
    instanceId: string,
    phone?: string,
    limit: number = 50,
    offset: number = 0
  ) {
    let sql = 'SELECT * FROM messages WHERE instance_id = $1'
    const params: any[] = [instanceId]

    if (phone) {
      const jid = toJid(formatBrazilianPhone(phone))
      sql += ' AND remote_jid = $2'
      params.push(jid)
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    return query(sql, params)
  }
}
