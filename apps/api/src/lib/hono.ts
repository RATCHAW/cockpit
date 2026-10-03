import { OpenAPIHono } from "@hono/zod-openapi"

import type { auth } from "./auth"

export type AppEnv = {
  Variables: {
    user: typeof auth.$Infer.Session.user | null
    session: typeof auth.$Infer.Session.session | null
  }
}

/** Router factory — returns a 422 with zod issues when request validation fails. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request", issues: result.error.issues }, 422)
      }
    },
  })
}
