import { schema } from "@cockpit/db"
import { resetPasswordMessage, verifyEmailMessage, type EmailMessage } from "@cockpit/email"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { openAPI } from "better-auth/plugins"
import { Effect, Redacted } from "effect"

import { config } from "./config"
import { db, EmailError, Mailer, runtime } from "./services"

/**
 * Fire-and-forget so response timing never reveals whether an account exists.
 * Every failure (including defects) is logged — an email problem must never crash the API.
 */
function sendInBackground(render: () => Promise<EmailMessage>) {
  void runtime.runPromise(
    Effect.tryPromise({ try: render, catch: (cause) => new EmailError({ cause }) }).pipe(
      Effect.flatMap((message) => Mailer.use((mailer) => mailer.send(message))),
      Effect.catchCause((cause) => Effect.logError("Failed to send auth email", cause)),
    ),
  )
}

export const auth = betterAuth({
  appName: "Cockpit",
  baseURL: config.authUrl.origin,
  secret: Redacted.value(config.authSecret),
  trustedOrigins: [config.webUrl.origin],
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      sendInBackground(() => resetPasswordMessage(user.email, url))
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground(() => verifyEmailMessage(user.email, url))
    },
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
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },

  advanced: {
    cookiePrefix: "cockpit",
    // Set by the Vite dev proxy / nginx from the socket address — clients cannot spoof it.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },

  plugins: [openAPI()],
})

export type Session = typeof auth.$Infer.Session
