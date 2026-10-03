import { createRoute, z } from "@hono/zod-openapi"

import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"

const MeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable(),
  })
  .openapi("Me")

const route = createRoute({
  method: "get",
  path: "/me",
  tags: ["Account"],
  summary: "Current user",
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: "The signed-in user",
      content: { "application/json": { schema: MeSchema } },
    },
    401: { description: "Not signed in" },
  },
})

export const meRoutes = createRouter().openapi(route, (c) => {
  const { id, name, email, emailVerified, image } = c.get("user")
  return c.json({ id, name, email, emailVerified, image: image ?? null }, 200)
})
