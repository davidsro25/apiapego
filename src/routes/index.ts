import { FastifyInstance } from "fastify"
import { authMiddleware } from "../middlewares/auth"
import { instanceRoutes } from "./instance.routes"
import { messageRoutes } from "./message.routes"
import { metaRoutes } from "./meta.routes"
import { keysRoutes } from "./keys.routes"
import { BaileysManager } from "../modules/instances/baileys.manager"

export async function registerRoutes(app: FastifyInstance) {

  app.addHook("preHandler", async (request: any, reply: any) => {
    const url = (request.url || "").split("?")[0]
    const publicPaths = ["/health", "/api/meta/webhook", "/docs", "/qr", "/dashboard", "/dashboard/login", "/api/server/status"]
    if (publicPaths.some((p: string) => url === p || url.startsWith(p + "/"))) return
    await authMiddleware(request, reply)
  })

  app.register(instanceRoutes, { prefix: "/api/instances" })
  app.register(messageRoutes, { prefix: "/api/instances" })
  app.register(metaRoutes, { prefix: "/api/meta" })
  app.register(keysRoutes, { prefix: "/api/keys" })

  // ─── SERVER STATUS ─────────────────────────────────────────────────────
  app.get("/api/server/status", {
    schema: {
      tags: ["Servidor"],
      summary: "Status do servidor e instâncias ativas",
    },
  }, async (_request, reply) => {
    const allInstances = BaileysManager.getAllInstances()
    const connected = allInstances.filter(i => i.status === "connected").length
    const connecting = allInstances.filter(i => i.status === "connecting" || i.status === "qr").length
    const disconnected = allInstances.filter(i => i.status === "disconnected").length

    return reply.send({
      success: true,
      data: {
        server: "online",
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        instances: {
          total: allInstances.length,
          connected,
          connecting,
          disconnected,
          list: allInstances,
        },
        timestamp: new Date().toISOString(),
      },
    })
  })
}
