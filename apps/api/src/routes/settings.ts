import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"

import { CurrencySchema, getSettings } from "../lib/finance"
import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import { jsonContent } from "../lib/openapi"
import { Db, runtime } from "../lib/services"

const SettingsSchema = z
  .object({
    /** Every amount is converted to this currency for display. */
    displayCurrency: CurrencySchema,
    /** Preselected when adding a transaction. */
    defaultCurrency: CurrencySchema,
  })
  .openapi("Settings")

const getRoute = createRoute({
  method: "get",
  path: "/settings",
  tags: ["Account"],
  summary: "Your preferences",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonContent(SettingsSchema, "Current preferences"),
    401: { description: "Not signed in" },
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/settings",
  tags: ["Account"],
  summary: "Update your preferences",
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { "application/json": { schema: SettingsSchema.partial() } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(SettingsSchema, "Updated preferences"),
    401: { description: "Not signed in" },
  },
})

export const settingsRoutes = createRouter()
  .openapi(getRoute, async (c) => {
    return c.json(await runtime.runPromise(getSettings(c.get("user").id)), 200)
  })
  .openapi(updateRoute, async (c) => {
    const userId = c.get("user").id
    const input = c.req.valid("json")
    if (Object.keys(input).length === 0) {
      return c.json(await runtime.runPromise(getSettings(userId)), 200)
    }
    await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .insert(schema.userSettings)
            .values({ userId, ...input })
            .onConflictDoUpdate({ target: schema.userSettings.userId, set: input }),
        ),
      ),
    )
    return c.json(await runtime.runPromise(getSettings(userId)), 200)
  })
