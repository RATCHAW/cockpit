import { hc } from "hono/client"

import type { AppType } from "./app"

export type { AppType }

/** Typed RPC client for the Cockpit API. */
export const createApiClient = (baseUrl: string, init?: RequestInit) =>
  hc<AppType>(baseUrl, { init: { credentials: "include", ...init } })
