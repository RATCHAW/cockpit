import { Scalar } from "@scalar/hono-api-reference"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"

import { auth } from "./lib/auth"
import { config } from "./lib/config"
import { createRouter } from "./lib/hono"
import { sessionMiddleware } from "./lib/middleware"
import { accountRoutes } from "./routes/accounts"
import { financeRoutes } from "./routes/finance"
import { habitRoutes } from "./routes/habits"
import { healthRoutes } from "./routes/health"
import { meRoutes } from "./routes/me"
import { projectRoutes } from "./routes/projects"
import { recurringRoutes } from "./routes/recurring"
import { settingsRoutes } from "./routes/settings"
import { taskRoutes } from "./routes/tasks"
import { transactionRoutes } from "./routes/transactions"

const api = createRouter().basePath("/api")

api.use("*", logger())
api.use("*", secureHeaders())
api.use(
  "*",
  cors({
    origin: config.webUrl.origin,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
)

api.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))

api.use("*", sessionMiddleware)

export const app = api
  .route("/", healthRoutes)
  .route("/", meRoutes)
  .route("/", settingsRoutes)
  .route("/", financeRoutes)
  .route("/", transactionRoutes)
  .route("/", recurringRoutes)
  .route("/", accountRoutes)
  .route("/", projectRoutes)
  .route("/", habitRoutes)
  .route("/", taskRoutes)

app.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "Cockpit API", version: "0.0.0" },
})

app.get(
  "/docs",
  Scalar({
    pageTitle: "Cockpit API",
    sources: [
      { title: "Cockpit API", url: "/api/openapi.json" },
      { title: "Auth", url: "/api/auth/open-api/generate-schema" },
    ],
  }),
)

export type AppType = typeof app
