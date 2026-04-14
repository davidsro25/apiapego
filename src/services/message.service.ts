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
  // Retorna o JID primario (com 9 para celulares BR de 8 digitos)
  private static resolveJid(phone: string): string {
    if (phone.includes('@')) return phone
    if (!isValidPhone(phone)) throw new Error('Numero invalido: ' + phone)
    return toJid(formatBrazilianPhone(phone))
  }

  // Retorna o formato alternativo (sem 9 se tinha, com 9 se nao tinha)
  private static altJid(jid: string): string | null {
    const digits = jid.replace('@s.whatsapp.net', '')
    if (!digits.startsWith('55') || digits.length < 12) return null
    const ddd = digits.slice(2, 4)
    const number = digits.slice(4)
    if (number.length === 9 && number.startsWith('9')) {
      return `55${ddd}${number.slice(1)}@s.whatsapp.net`
    }
    if (number.length === 8) {
      return `55${ddd}9${number}@s.whatsapp.net`
    }
    return null
  }

  // Tenta fn(jid); se falhar, tenta fn(altJid). Nunca envia para os dois.
  private static async withFallback(
    jid: string,
    fn: (j: string) => Promise<proto.IWebMessageInfo | undefined>
  ): Promise<proto.IWebMessageInfo | undefined> {
    try {
      return await fn(jid)
    } catch (err: any) {
      const alt = this.altJid(jid)
      if (!alt) throw err
      logger.warn({ jid, alt, errMsg: err.message }, 'send falhou, tentando formato alternativo')
      return await fn(alt)
    }
  }

  private static buildResult(msg: proto.IWebMessageInfo | undefined): SendResult {
    return {
      success: true,
      messageId: msg?.key?.id || '',
      remoteJid: msg?.key?.remoteJid || '',
      timestamp: (() => {
        const ts = msg?.messageTimestamp
        if (ts == null) return Math.floor(Date.now() / 1000)
        if (typeof ts === 'number') return ts
        return typeof (ts as any).toNumber === 'function' ? (ts as any).toNumber() : Number(ts)
      })(),
    }
  }

  // ============================================
  // TEXT
  // ============================================
  static async sendText(instanceId: string, phone: string, text: string, quoted?: string): Promise<SendResult> {
    const jid = this.resolveJid(phone)
    const msg = await this.withFallback(jid, (j) => BaileysManager.sendMessage(instanceId, j, { text }))
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
    const jid = this.resolveJid(phone)

    const isBase64 = image.startsWith('data:') || !image.startsWith('http')
    const content: any = isBase64
      ? { image: Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64'), caption }
      : { image: { url: image }, caption }

    const msg = await this.withFallback(jid, (j) => BaileysManager.sendMessage(instanceId, j, content))
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
    const jid = this.resolveJid(phone)
    const msg = await this.withFallback(jid, (j) => BaileysManager.sendMessage(instanceId, j, {
      video: { url: video },
      caption,
    }))
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
    const jid = this.resolveJid(phone)
    const msg = await this.withFallback(jid, (j) => BaileysManager.sendMessage(instanceId, j, {
      audio: { url: audio },
      ptt,
      mimetype: 'audio/ogg; codecs=opus',
    }))
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
    const jid = this.resolveJid(phone)
    const msg = await this.withFallback(jid, (j) => BaileysManager.sendMessage(instanceId, j, {
      document: { url },
      fileName: filename,
      mimetype: mimetype || 'application/octet-stream',
    }))
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
    const jid = this.resolveJid(phone)
    const msg = await this.withFallback(jid, (j) => BaileysManager.sendMessage(instanceId, j, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude, name },
    }))
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
    const jid = this.resolveJid(phone)
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
    const jid = this.resolveJid(phone)
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
    const jid = this.resolveJid(phone)
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
    const jid = this.resolveJid(phone)
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
    const jid = this.resolveJid(phone)
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
    const jid = this.resolveJid(phone)
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
    const jid = this.resolveJid(phone)
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
