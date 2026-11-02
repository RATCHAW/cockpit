import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { createDb, schema } from "@cockpit/db"
import { ensureOwner } from "@cockpit/db/owner"
import { eq, inArray } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { hc, parseResponse } from "hono/client"

import type { AppType } from "../app"
import { IDEA_MAX_LENGTH } from "../shared/ideas"

const testUrl = process.env.IDEAS_TEST_DATABASE_URL
const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url))

test("Ideas API persists private captures, edits, and archives", { skip: !testUrl }, async (t) => {
  assert.ok(testUrl)
  process.env.DATABASE_URL = testUrl
  process.env.BETTER_AUTH_SECRET = "ideas-test-secret-for-disposable-database-only"
  process.env.BETTER_AUTH_URL = "http://localhost:3000"
  process.env.WEB_URL = "http://localhost:5173"
  const db = createDb(testUrl)
  const { app } = await import("../app")
  const { db: serviceDb, runtime } = await import("../lib/services")
  const dispatch: typeof fetch = async (input, init) => app.request(new Request(input, init))

  try {
    await migrate(db, { migrationsFolder })
    const owner = await ensureOwner(db, {
      email: "ideas-test@example.com",
      password: "disposable-test-password",
      name: "Ideas test",
    })
    const other = await ensureOwner(db, {
      email: "ideas-other@example.com",
      password: "disposable-test-password",
      name: "Other test",
    })
    const login = await app.request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        "x-real-ip": "127.0.0.43",
      },
      body: JSON.stringify({ email: owner.email, password: "disposable-test-password" }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")
    assert.ok(cookie)
    const client = hc<AppType>("http://localhost:3000", {
      headers: { Cookie: cookie },
      fetch: dispatch,
    }).api
    const anonymous = hc<AppType>("http://localhost:3000", { fetch: dispatch }).api
    const [foreign] = await db
      .insert(schema.idea)
      .values({
        userId: other.id,
        content: "Someone else's thought",
      })
      .returning()
    assert.ok(foreign)

    await t.test("requires authentication for every operation", async () => {
      assert.equal((await anonymous.ideas.$get()).status, 401)
      assert.equal((await anonymous.ideas.$post({ json: { content: "Private" } })).status, 401)
      assert.equal(
        (
          await anonymous.ideas[":id"].$patch({
            param: { id: foreign.id },
            json: { archived: true },
          })
        ).status,
        401,
      )
    })

    await t.test("rejects empty, oversized, and malformed updates", async () => {
      for (const content of ["", "  \n\t ", "a".repeat(IDEA_MAX_LENGTH + 1)]) {
        assert.equal((await client.ideas.$post({ json: { content } })).status, 422)
      }
      assert.equal(
        (await client.ideas[":id"].$patch({ param: { id: foreign.id }, json: {} })).status,
        422,
      )
      assert.equal(
        (await client.ideas[":id"].$patch({ param: { id: "invalid" }, json: { archived: true } }))
          .status,
        422,
      )
    })

    const captured = await parseResponse(
      client.ideas.$post({ json: { content: "  What if…\nKeep the second line.  " } }),
    )
    assert.equal(captured.content, "What if…\nKeep the second line.")
    assert.equal(captured.archived, false)

    await t.test(
      "stores captures in PostgreSQL and lists only the signed-in owner's ideas",
      async () => {
        const [stored] = await db.select().from(schema.idea).where(eq(schema.idea.id, captured.id))
        assert.equal(stored?.userId, owner.id)
        assert.equal(stored?.content, captured.content)
        const next = await parseResponse(
          client.ideas.$post({ json: { content: "A newer thought" } }),
        )
        const list = await parseResponse(client.ideas.$get())
        assert.equal(list.items[0]?.id, next.id)
        assert.ok(list.items.some((idea) => idea.id === captured.id))
        assert.ok(!list.items.some((idea) => idea.id === foreign.id))
      },
    )

    await t.test(
      "edits without changing the original capture time and validates new content",
      async () => {
        assert.equal(
          (
            await client.ideas[":id"].$patch({
              param: { id: captured.id },
              json: { content: "  " },
            })
          ).status,
          422,
        )
        const edited = await parseResponse(
          client.ideas[":id"].$patch({
            param: { id: captured.id },
            json: { content: "  A clearer thought  " },
          }),
        )
        assert.equal(edited.content, "A clearer thought")
        assert.equal(edited.createdAt, captured.createdAt)
        assert.ok(edited.updatedAt >= captured.updatedAt)
      },
    )

    await t.test("archives and restores without losing content", async () => {
      const archived = await parseResponse(
        client.ideas[":id"].$patch({ param: { id: captured.id }, json: { archived: true } }),
      )
      assert.equal(archived.archived, true)
      assert.equal(archived.content, "A clearer thought")
      const list = await parseResponse(client.ideas.$get())
      assert.equal(list.items.find((idea) => idea.id === captured.id)?.archived, true)
      const restored = await parseResponse(
        client.ideas[":id"].$patch({ param: { id: captured.id }, json: { archived: false } }),
      )
      assert.equal(restored.archived, false)
      const [stored] = await db.select().from(schema.idea).where(eq(schema.idea.id, captured.id))
      assert.equal(stored?.archived, false)
      assert.equal(stored?.content, "A clearer thought")
    })

    await t.test("cannot edit or archive another owner's ideas", async () => {
      for (const id of [foreign.id, crypto.randomUUID()]) {
        assert.equal(
          (await client.ideas[":id"].$patch({ param: { id }, json: { content: "Stolen" } })).status,
          404,
        )
        assert.equal(
          (await client.ideas[":id"].$patch({ param: { id }, json: { archived: true } })).status,
          404,
        )
      }
      const [stored] = await db.select().from(schema.idea).where(eq(schema.idea.id, foreign.id))
      assert.equal(stored?.content, foreign.content)
      assert.equal(stored?.archived, false)
    })
  } finally {
    await db
      .delete(schema.user)
      .where(inArray(schema.user.email, ["ideas-test@example.com", "ideas-other@example.com"]))
    await runtime.dispose()
    await serviceDb.$client.end()
    await db.$client.end()
  }
})
