import { hashPassword, verifyPassword } from "better-auth/crypto"
import { and, eq } from "drizzle-orm"

import type { Database } from "./index"
import { account, session, user } from "./schema"

export interface OwnerCredentials {
  email: string
  password: string
  name: string
}

/**
 * Cockpit has exactly one account and no sign-up: this creates it with a verified email and a
 * Better Auth credential account. The given password is the source of truth: if it no longer
 * matches, the stored hash is replaced and every session is revoked. That is how you change or
 * recover the password.
 */
export async function ensureOwner(
  db: Database,
  { email, password, name }: OwnerCredentials,
): Promise<{ id: string; email: string; status: "created" | "updated" | "unchanged" }> {
  const [existing] = await db
    .select({ id: user.id, accountId: account.id, hash: account.password })
    .from(user)
    .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .where(eq(user.email, email))

  if (!existing) {
    const id = crypto.randomUUID()
    const hash = await hashPassword(password)
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id, name, email, emailVerified: true })
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hash,
      })
    })
    return { id, email, status: "created" }
  }

  if (existing.hash && (await verifyPassword({ hash: existing.hash, password }))) {
    return { id: existing.id, email, status: "unchanged" }
  }

  const hash = await hashPassword(password)
  await db.transaction(async (tx) => {
    if (existing.accountId) {
      await tx.update(account).set({ password: hash }).where(eq(account.id, existing.accountId))
    } else {
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: existing.id,
        providerId: "credential",
        userId: existing.id,
        password: hash,
      })
    }
    await tx.delete(session).where(eq(session.userId, existing.id))
  })
  return { id: existing.id, email, status: "updated" }
}
