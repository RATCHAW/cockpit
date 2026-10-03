import type { Server } from "node:http"

import { serve } from "@hono/node-server"

import { app } from "./app"
import { config } from "./lib/config"
import { runtime } from "./lib/services"

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.info(`API listening on http://localhost:${info.port} — docs at /api/docs`)
}) as Server

const shutdown = () => {
  // Don't let a stuck request block shutdown (or a dev-server restart) forever.
  setTimeout(() => process.exit(1), 5_000).unref()
  server.close(async () => {
    await runtime.dispose()
    process.exit(0)
  })
  // Keep-alive sockets (e.g. the Vite proxy) would otherwise hold the port open.
  // In dev, drop everything so watch-mode restarts never race the old process for the port.
  if (config.nodeEnv === "production") server.closeIdleConnections()
  else server.closeAllConnections()
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
