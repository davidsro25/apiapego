import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../database/db'
import { cacheDel } from '../database/redis'
import { BaileysManager } from '../modules/instances/baileys.manager'
import { logger } from '../utils/logger'

export interface Instance {
  id: string
  name: string
  api_key: string
  status: string
  webhook_url: string | null
  webhook_enabled: boolean
  webhook_events: string[]
  settings: Record<string, any>
  phone: string | null
  profile_name: string | null
  provider: string
  subscription_active: boolean
  created_at: Date
  updated_at: Date
}

export interface CreateInstanceDto {
  name: string
  webhookUrl?: string
  webhookEnabled?: boolean
  webhookEvents?: string[]
  settings?: Record<string, any>
  provider?: 'baileys' | 'meta'
}

export interface UpdateWebhookDto {
  url?: string
  enabled?: boolean
  events?: string[]
}

const GET_BY_ID_OR_NAME = `SELECT * FROM instances WHERE id::text = $1 OR name = $1`

export class InstanceService {
  static async list(): Promise<Instance[]> {
    const rows = await query<Instance>('SELECT * FROM instances ORDER BY created_at DESC')
    return rows.map((r) => ({ ...r, status: BaileysManager.getStatus(r.id) || r.status }))
  }

  static async get(idOrName: string): Promise<Instance | null> {
    const row = await queryOne<Instance>(GET_BY_ID_OR_NAME, [idOrName])
    if (!row) return null
    return { ...row, status: BaileysManager.getStatus(row.id) || row.status }
  }

  static async create(dto: CreateInstanceDto): Promise<Instance> {
    const existing = await queryOne('SELECT id FROM instances WHERE name = $1', [dto.name])
    if (existing) throw new Error(`Instance "${dto.name}" already exists`)

    const id = uuidv4()
    const apiKey = `apego_${uuidv4().replace(/-/g, '')}`
    const events = dto.webhookEvents || ['messages', 'status', 'connection']
    const settings = dto.settings || {}
    const webhookEnabled = dto.webhookEnabled !== false

    const [instance] = await query<Instance>(
      `INSERT INTO instances (id, name, api_key, webhook_url, webhook_enabled, webhook_events, settings, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, dto.name, apiKey, dto.webhookUrl || null, webhookEnabled, events, JSON.stringify(settings), dto.provider || 'baileys']
    )

    if (dto.provider !== 'meta') {
      BaileysManager.connect(id, dto.name).catch((err) =>
        logger.error({ err, name: dto.name }, 'Failed to start instance')
      )
    }

    logger.info({ name: dto.name, id }, 'Instance created')
    return instance
  }

  static async delete(idOrName: string): Promise<void> {
    const instance = await this.get(idOrName)
    if (!instance) throw new Error('Instance not found')

    await BaileysManager.deleteInstance(instance.id, instance.name)
    await query('DELETE FROM instances WHERE id::text = $1', [instance.id])
    await cacheDel(`apikey:${instance.api_key}`)

    logger.info({ name: instance.name }, 'Instance deleted')
  }

  static async logout(idOrName: string): Promise<void> {
    const instance = await this.get(idOrName)
    if (!instance) throw new Error('Instance not found')
    await BaileysManager.logout(instance.id, instance.name)
    logger.info({ name: instance.name }, 'Instance logged out')
  }

  static async restart(idOrName: string): Promise<void> {
    const instance = await this.get(idOrName)
    if (!instance) throw new Error('Instance not found')
    await BaileysManager.deleteInstance(instance.id, instance.name)
    await BaileysManager.connect(instance.id, instance.name)
    logger.info({ name: instance.name }, 'Instance restarted')
  }

  static async updateWebhook(idOrName: string, dto: UpdateWebhookDto): Promise<Instance> {
    const instance = await this.get(idOrName)
    if (!instance) throw new Error('Instance not found')

    const url = dto.url !== undefined ? dto.url : instance.webhook_url
    const enabled = dto.enabled !== undefined ? dto.enabled : instance.webhook_enabled
    const events = dto.events || instance.webhook_events

    const [updated] = await query<Instance>(
      `UPDATE instances SET webhook_url = $2, webhook_enabled = $3, webhook_events = $4, updated_at = NOW()
       WHERE id::text = $1 RETURNING *`,
      [instance.id, url, enabled, events]
    )
    return updated
  }

  static async updateSettings(idOrName: string, settings: Record<string, any>): Promise<Instance> {
    const instance = await this.get(idOrName)
    if (!instance) throw new Error('Instance not found')

    const merged = { ...instance.settings, ...settings }
    const [updated] = await query<Instance>(
      `UPDATE instances SET settings = $2, updated_at = NOW() WHERE id::text = $1 RETURNING *`,
      [instance.id, JSON.stringify(merged)]
    )
    return updated
  }

  static async updateSubscription(idOrName: string, active: boolean): Promise<Instance> {
    const instance = await this.get(idOrName)
    if (!instance) throw new Error('Instance not found')

    const [updated] = await query<Instance>(
      `UPDATE instances SET subscription_active = $2, updated_at = NOW() WHERE id::text = $1 RETURNING *`,
      [instance.id, active]
    )
    return updated
  }

  static async getQr(idOrName: string): Promise<{ qr: string | null; status: string }> {
    const instance = await this.get(idOrName)
    if (!instance) throw new Error('Instance not found')
    const qr = BaileysManager.getQr(instance.id)
    const status = BaileysManager.getStatus(instance.id)
    return { qr, status }
  }
}
