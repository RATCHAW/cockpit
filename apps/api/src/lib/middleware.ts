import { createMiddleware } from "hono/factory"

import { auth } from "./auth"
import type { AppEnv } from "./hono"

/** Resolves the Better Auth session (if any) onto the context. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set("user", result?.user ?? null)
  c.set("session", result?.session ?? null)
  await next()
})

/** Rejects unauthenticated requests. Narrows `c.var.user` for downstream handlers. */
export const requireAuth = createMiddleware<{
  Variables: {
    user: NonNullable<AppEnv["Variables"]["user"]>
    session: NonNullable<AppEnv["Variables"]["session"]>
  }
}>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "Unauthorized" }, 401)
  await next()
})
