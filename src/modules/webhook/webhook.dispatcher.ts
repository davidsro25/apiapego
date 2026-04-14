import axios from 'axios'
import { queryOne } from '../../database/db'
import { logger } from '../../utils/logger'
import { config } from '../../config'

interface WebhookConfig {
  webhook_url: string | null
  webhook_enabled: boolean
  webhook_events: string[]
  subscription_active: boolean
  cachedAt: number
}

// In-memory cache: instanceId -> WebhookConfig (TTL 60s)
const webhookCache = new Map<string, WebhookConfig>()
const CACHE_TTL_MS = 60_000

export class WebhookDispatcher {
  static invalidateCache(instanceId: string) {
    webhookCache.delete(instanceId)
  }

  private static async getConfig(instanceId: string): Promise<WebhookConfig | null> {
    const cached = webhookCache.get(instanceId)
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached
    }
    const instance = await queryOne<{
      webhook_url: string | null
      webhook_enabled: boolean
      webhook_events: string[]
      subscription_active: boolean
    }>(
      'SELECT webhook_url, webhook_enabled, webhook_events, subscription_active FROM instances WHERE id = $1',
      [instanceId]
    )
    if (!instance) return null
    const cfg: WebhookConfig = { ...instance, cachedAt: Date.now() }
    webhookCache.set(instanceId, cfg)
    return cfg
  }

  static async dispatch(
    instanceId: string,
    eventType: string,
    payload: any
  ): Promise<void> {
    let instance: WebhookConfig | null
    try {
      instance = await this.getConfig(instanceId)
    } catch (err: any) {
      logger.warn({ instanceId, err: err.message }, 'WebhookDispatcher: failed to get config, skipping')
      return
    }

    if (!instance?.webhook_url) return
    if (instance.webhook_enabled === false) return
    if (instance.subscription_active === false) return

    const events = instance.webhook_events || []
    if (!events.includes('all') && !events.includes(eventType)) return

    const body = {
      event: eventType,
      instanceId,
      timestamp: Date.now(),
      data: payload,
    }

    await this.sendWithRetry(instance.webhook_url, body, config.webhook.retryAttempts)
  }

  private static async sendWithRetry(url: string, body: any, retries: number): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await axios.post(url, body, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ApiApego/2.0',
          },
        })
        logger.debug({ url, attempt }, 'Webhook dispatched')
        return
      } catch (err: any) {
        logger.warn({ url, attempt, error: err.message }, 'Webhook delivery failed')
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, config.webhook.retryDelay * attempt))
        }
      }
    }
    logger.error({ url }, 'Webhook failed after all retries')
  }
}
