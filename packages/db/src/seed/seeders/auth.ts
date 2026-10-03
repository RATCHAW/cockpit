import type { Database } from "../../index"
import { ensureOwner } from "../../owner"
import type { SeedContext } from "../types"

export const ADMIN_EMAIL = "admin@example.com"
export const ADMIN_PASSWORD = "admin@example.com"

/** Creates the local owner account so you can sign in with email and password straight away. */
export async function seedAdmin(db: Database): Promise<SeedContext["admin"]> {
  const owner = await ensureOwner(db, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: "Admin",
  })
  console.log(`  admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (${owner.status})`)
  return { id: owner.id, email: owner.email }
}
