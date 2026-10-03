import { createApiClient } from "@cockpit/api/client"

/** Typed RPC client — routes and payloads are inferred from the Hono app. */
export const api = createApiClient(window.location.origin).api
