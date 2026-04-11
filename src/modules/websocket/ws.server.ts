import { WebSocket } from 'ws'
import { logger } from '../../utils/logger'

// Mapa: instanceId -> Set de conexões WebSocket
const connections = new Map<string, Set<WebSocket>>()

export class WebSocketServer {
  /**
   * Registra uma conexão WebSocket para uma instância
   */
  static register(instanceId: string, ws: WebSocket) {
    if (!connections.has(instanceId)) {
      connections.set(instanceId, new Set())
    }

    connections.get(instanceId)!.add(ws)
    logger.debug({ instanceId }, 'WebSocket client connected')

    ws.on('close', () => {
      connections.get(instanceId)?.delete(ws)
      logger.debug({ instanceId }, 'WebSocket client disconnected')
    })

    ws.on('error', (err) => {
      logger.error({ err, instanceId }, 'WebSocket error')
      connections.get(instanceId)?.delete(ws)
    })
  }

  /**
   * Broadcast de evento para todos os clientes de uma instância
   */
  static async broadcast(instanceId: string, payload: any): Promise<void> {
    const clients = connections.get(instanceId)
    if (!clients || clients.size === 0) return

    const data = JSON.stringify(payload)

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data)
        } catch (err) {
          logger.error({ err }, 'Failed to send WebSocket message')
          clients.delete(client)
        }
      } else {
        clients.delete(client)
      }
    }
  }

  /**
   * Retorna quantidade de conexões ativas por instância
   */
  static getConnectionCount(instanceId: string): number {
    return connections.get(instanceId)?.size || 0
  }
}
