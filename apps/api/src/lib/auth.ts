import { schema } from "@cockpit/db"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { openAPI } from "better-auth/plugins"
import { Redacted } from "effect"

import { config } from "./config"
import { db } from "./services"

export const auth = betterAuth({
  appName: "Cockpit",
  baseURL: config.authUrl.origin,
  secret: Redacted.value(config.authSecret),
  trustedOrigins: [config.webUrl.origin],
  database: drizzleAdapter(db, { provider: "pg", schema }),

  // Single-user app: the owner account is created by the release step (`@cockpit/db/owner`)
  // from OWNER_EMAIL / OWNER_PASSWORD, which is also how the password is changed.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },

  advanced: {
    cookiePrefix: "cockpit",
    // Set from the socket address by the Vite dev proxy, nginx or Coolify's Traefik, so clients
    // cannot spoof it. Behind the Vercel rewrite, that address is Vercel's edge, not the browser.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },

  plugins: [openAPI()],
})

export type Session = typeof auth.$Infer.Session
