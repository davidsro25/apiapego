import type { WebSocket } from '@fastify/websocket'
import { logger } from '../../utils/logger'

// Mapa: instanceId -> Set de conexões WebSocket
const connections = new Map<string, Set<WebSocket>>()

export class WebSocketServer {
  static register(instanceId: string, ws: WebSocket) {
    if (!connections.has(instanceId)) {
      connections.set(instanceId, new Set())
    }

    connections.get(instanceId)!.add(ws)
    logger.debug({ instanceId }, 'WebSocket client connected')

    ws.on('close', () => {
      connections.get(instanceId)?.delete(ws)
    })

    ws.on('error', (err: Error) => {
      logger.error({ err, instanceId }, 'WebSocket error')
      connections.get(instanceId)?.delete(ws)
    })
  }

  static broadcast(instanceId: string, payload: unknown): void {
    const clients = connections.get(instanceId)
    if (!clients || clients.size === 0) return

    const data = JSON.stringify(payload)

    for (const client of clients) {
      if (client.readyState === 1) { // OPEN = 1
        try {
          client.send(data)
        } catch (err) {
          clients.delete(client)
        }
      } else {
        clients.delete(client)
      }
    }
  }

  static getConnectionCount(instanceId: string): number {
    return connections.get(instanceId)?.size || 0
  }
}
