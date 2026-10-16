import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"

import { today } from "../lib/dates"
import {
  AmountSchema,
  BalanceDateSchema,
  convert,
  RATES_UNAVAILABLE,
  ratesUnavailable,
  roundBalance,
  UNKNOWN_ACCOUNT,
  unknownAccount,
  UnknownAccountError,
} from "../lib/finance"
import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import { errorResponse, IdParamSchema, IsoDateSchema, jsonContent } from "../lib/openapi"
import { Db, ExchangeRates, runtime } from "../lib/services"

const TransferInputSchema = z
  .object({
    fromAccountId: z.uuid(),
    toAccountId: z.uuid(),
    /** What leaves `fromAccountId`, in its currency. */
    amount: AmountSchema,
    /**
     * What reaches `toAccountId`, in its currency. Defaults to `amount`, converted at the rate of
     * `date` when the two accounts hold different currencies.
     */
    received: AmountSchema.optional(),
    /** Defaults to today. */
    date: BalanceDateSchema.optional(),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, {
    message: "Pick two different accounts",
    path: ["toAccountId"],
  })
  .openapi("TransferInput")

const TransferSchema = z
  .object({
    id: z.uuid(),
    fromAccountId: z.uuid().nullable(),
    toAccountId: z.uuid().nullable(),
    amount: z.number(),
    received: z.number(),
    date: IsoDateSchema,
  })
  .openapi("Transfer")

const createTransferRoute = createRoute({
  method: "post",
  path: "/finance/transfers",
  tags: ["Accounts"],
  summary: "Move money between accounts",
  description:
    "Takes `amount` out of one account and puts `received` into another. Neither income nor " +
    "spending: only the two balances change. A balance recorded on either account after the " +
    "transfer already counts it.",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: TransferInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(TransferSchema, "The transfer"),
    401: { description: "Not signed in" },
    422: unknownAccount,
    502: ratesUnavailable,
  },
})

const deleteTransferRoute = createRoute({
  method: "delete",
  path: "/finance/transfers/{id}",
  tags: ["Accounts"],
  summary: "Undo a transfer",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in" },
    404: errorResponse("Transfer not found"),
  },
})

export const transferRoutes = createRouter()
  .openapi(createTransferRoute, (c) => {
    const user = c.get("user")
    const { fromAccountId, toAccountId, amount, received, date = today() } = c.req.valid("json")

    const program = Effect.gen(function* () {
      const db = yield* Db
      const accounts = yield* db.query((db) =>
        db
          .select({ id: schema.financeAccount.id, currency: schema.financeAccount.currency })
          .from(schema.financeAccount)
          .where(
            and(
              eq(schema.financeAccount.userId, user.id),
              inArray(schema.financeAccount.id, [fromAccountId, toAccountId]),
            ),
          ),
      )
      const from = accounts.find((a) => a.id === fromAccountId)
      const to = accounts.find((a) => a.id === toAccountId)
      if (!from) return yield* Effect.fail(new UnknownAccountError({ accountId: fromAccountId }))
      if (!to) return yield* Effect.fail(new UnknownAccountError({ accountId: toAccountId }))

      let arrived = received ?? amount
      if (received === undefined && from.currency !== to.currency) {
        const rates = (yield* ExchangeRates.use((fx) => fx.forDates([date]))).get(date)!
        arrived = roundBalance(convert(amount, from.currency, to.currency, rates), to.currency)
      }

      const [row] = yield* db.query((db) =>
        db
          .insert(schema.transfer)
          .values({ userId: user.id, fromAccountId, toAccountId, amount, received: arrived, date })
          .returning(),
      )
      const { id } = row!
      return { id, fromAccountId, toAccountId, amount, received: arrived, date }
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((transfer) => c.json(transfer, 201)),
        Effect.catchTag("UnknownAccountError", () => Effect.succeed(c.json(UNKNOWN_ACCOUNT, 422))),
        Effect.catchTag("RatesError", () => Effect.succeed(c.json(RATES_UNAVAILABLE, 502))),
      ),
    )
  })
  .openapi(deleteTransferRoute, async (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const deleted = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .delete(schema.transfer)
            .where(and(eq(schema.transfer.id, id), eq(schema.transfer.userId, user.id)))
            .returning({ id: schema.transfer.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Transfer not found" }, 404)
  })
