import { hashPassword } from "better-auth/crypto"
import { eq } from "drizzle-orm"

import type { Database } from "../../index"
import { account, user } from "../../schema"
import type { SeedContext } from "../types"

export const ADMIN_EMAIL = "admin@example.com"
export const ADMIN_PASSWORD = "admin@example.com"

/**
 * Creates the admin user with a verified email and a Better Auth credential account,
 * so you can sign in with email and password straight away. Skips if it already exists.
 */
export async function seedAdmin(db: Database): Promise<SeedContext["admin"]> {
  const [existing] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
  if (existing) {
    console.log(`  admin: ${ADMIN_EMAIL} already exists, skipping`)
    return existing
  }

  const id = crypto.randomUUID()
  const password = await hashPassword(ADMIN_PASSWORD)

  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id, name: "Admin", email: ADMIN_EMAIL, emailVerified: true })
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password,
    })
  })

  console.log(`  admin: created ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  return { id, email: ADMIN_EMAIL }
}
