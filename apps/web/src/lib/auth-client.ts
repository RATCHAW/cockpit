import { createAuthClient } from "better-auth/react"

/** Same-origin: the API is reached through `/api` (Vite proxy in dev, nginx in production). */
export const authClient = createAuthClient()

export type Session = typeof authClient.$Infer.Session
