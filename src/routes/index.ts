import { FastifyInstance } from "fastify"
import { authMiddleware } from "../middlewares/auth"
import { instanceRoutes } from "./instance.routes"
import { messageRoutes } from "./message.routes"
import { metaRoutes } from "./meta.routes"
import { keysRoutes } from "./keys.routes"

export async function registerRoutes(app: FastifyInstance) {

  app.addHook("preHandler", async (request: any, reply: any) => {
    const url = (request.url || "").split("?")[0]
    const publicPaths = ["/health", "/api/meta/webhook", "/docs", "/qr", "/dashboard", "/dashboard/login"]
    if (publicPaths.some((p: string) => url === p || url.startsWith(p + "/"))) return
    await authMiddleware(request, reply)
  })

  app.register(instanceRoutes, { prefix: "/api/instances" })
  app.register(messageRoutes, { prefix: "/api/instances" })
  app.register(metaRoutes, { prefix: "/api/meta" })
  app.register(keysRoutes, { prefix: "/api/keys" })
}
