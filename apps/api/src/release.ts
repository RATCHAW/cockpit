/**
 * Production release step, run by the container before the server starts: applies pending
 * migrations, then makes sure the owner account exists with OWNER_PASSWORD (see `ensureOwner`).
 */
import { fileURLToPath } from "node:url"

import { createDb } from "@cockpit/db"
import { ensureOwner } from "@cockpit/db/owner"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Config, Effect, Redacted } from "effect"

const ReleaseConfig = Config.all({
  databaseUrl: Config.Redacted("DATABASE_URL"),
  migrationsFolder: Config.String("MIGRATIONS_DIR").pipe(
    Config.withDefault(fileURLToPath(new URL("../drizzle", import.meta.url))),
  ),
  ownerEmail: Config.NonEmptyString("OWNER_EMAIL"),
  ownerPassword: Config.Redacted("OWNER_PASSWORD"),
  ownerName: Config.NonEmptyString("OWNER_NAME").pipe(Config.withDefault("Owner")),
})

const config = (() => {
  try {
    return Effect.runSync(ReleaseConfig)
  } catch (error) {
    throw new Error(`Invalid environment: ${(error as Error).message}`, { cause: error })
  }
})()

const password = Redacted.value(config.ownerPassword)
if (password.length < 12) throw new Error("OWNER_PASSWORD must be at least 12 characters")

const db = createDb(Redacted.value(config.databaseUrl))

try {
  await migrate(db, { migrationsFolder: config.migrationsFolder })
  console.info("Migrations applied")

  const owner = await ensureOwner(db, {
    email: config.ownerEmail.toLowerCase(),
    password,
    name: config.ownerName,
  })
  console.info(`Owner ${owner.email}: ${owner.status}`)
} finally {
  await db.$client.end()
}
