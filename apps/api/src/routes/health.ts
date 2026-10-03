import { createRoute, z } from "@hono/zod-openapi"
import { Effect } from "effect"

import { createRouter } from "../lib/hono"
import { Db, runtime } from "../lib/services"

const HealthSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["up", "down"]),
  })
  .openapi("Health")

const route = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Service health",
  responses: {
    200: { description: "Healthy", content: { "application/json": { schema: HealthSchema } } },
    503: { description: "Degraded", content: { "application/json": { schema: HealthSchema } } },
  },
})

export const healthRoutes = createRouter().openapi(route, async (c) => {
  const database = await runtime.runPromise(
    Db.use((db) => db.ping).pipe(
      Effect.as("up" as const),
      Effect.catchTag("DatabaseError", () => Effect.succeed("down" as const)),
    ),
  )
  return database === "up"
    ? c.json({ status: "ok" as const, database }, 200)
    : c.json({ status: "degraded" as const, database }, 503)
})
