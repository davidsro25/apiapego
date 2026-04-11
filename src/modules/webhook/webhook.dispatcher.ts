import axios from 'axios'
import { queryOne } from '../../database/db'
import { logger } from '../../utils/logger'
import { config } from '../../config'

export class WebhookDispatcher {
  /**
   * Despacha evento para o webhook configurado na instância
   */
  static async dispatch(
    instanceId: string,
    eventType: 'messages' | 'status' | 'connection',
    payload: any
  ): Promise<void> {
    const instance = await queryOne<{ webhook_url: string | null; webhook_events: string[] }>(
      'SELECT webhook_url, webhook_events FROM instances WHERE id = $1',
      [instanceId]
    )

    if (!instance?.webhook_url) return
    if (!instance.webhook_events?.includes(eventType)) return

    const body = {
      event: eventType,
      instanceId,
      timestamp: Date.now(),
      data: payload,
    }

    await this.sendWithRetry(instance.webhook_url, body, config.webhook.retryAttempts)
  }

  private static async sendWithRetry(
    url: string,
    body: any,
    retries: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await axios.post(url, body, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'WhaAPI/1.0',
          },
        })
        logger.debug({ url, attempt }, 'Webhook dispatched')
        return
      } catch (err: any) {
        logger.warn({ url, attempt, error: err.message }, 'Webhook delivery failed')

        if (attempt < retries) {
          await new Promise((r) =>
            setTimeout(r, config.webhook.retryDelay * attempt)
          )
        }
      }
    }

    logger.error({ url }, 'Webhook failed after all retries')
  }
}
