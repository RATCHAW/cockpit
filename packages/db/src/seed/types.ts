import type { Database } from "../index"

export interface SeedContext {
  db: Database
  /** The admin user every feature's demo data belongs to. */
  admin: { id: string; email: string }
}

/**
 * One seeder per feature. Seeders run in the order they're listed in `seeders/index.ts`,
 * after the admin user exists. Use `drizzle-seed` for bulk realistic data, scoped to the
 * feature's tables, and pin owner columns to `ctx.admin.id`.
 */
export interface Seeder {
  name: string
  run: (ctx: SeedContext) => Promise<void>
}
