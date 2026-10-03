import { createDb, schema, type Database } from "@cockpit/db"
import { inArray, sql } from "drizzle-orm"
import { Context, Data, Effect, Layer, ManagedRuntime, Redacted } from "effect"

import { CURRENCIES } from "../shared/finance"
import { config } from "./config"
import { today, type IsoDate } from "./dates"

export class DatabaseError extends Data.TaggedError("DatabaseError")<{ cause: unknown }> {}

export const db = createDb(Redacted.value(config.databaseUrl))

export class Db extends Context.Service<
  Db,
  {
    readonly query: <A>(run: (db: Database) => Promise<A>) => Effect.Effect<A, DatabaseError>
    readonly ping: Effect.Effect<void, DatabaseError>
  }
>()("cockpit/Db") {}

const query = <A>(run: (db: Database) => Promise<A>) =>
  Effect.tryPromise({ try: () => run(db), catch: (cause) => new DatabaseError({ cause }) })

export const DbLive = Layer.succeed(Db, {
  query,
  ping: query((db) => db.execute(sql`select 1`)).pipe(Effect.asVoid),
})

export class RatesError extends Data.TaggedError("RatesError")<{ cause: unknown }> {}

/** Units of each supported currency per 1 USD. */
export type Rates = Record<string, number>

export class ExchangeRates extends Context.Service<
  ExchangeRates,
  {
    /**
     * Rates for each requested date. Past days are cached in the database forever; today and
     * future dates use the latest published rates. If the provider is unreachable, the closest
     * cached day stands in.
     */
    readonly forDates: (
      dates: Iterable<IsoDate>,
    ) => Effect.Effect<Map<IsoDate, Rates>, RatesError | DatabaseError>
  }
>()("cockpit/ExchangeRates") {}

/** fawazahmed0/exchange-api: free, keyless, daily, covers MAD and every currency we list. */
const PROVIDER_FIRST_DAY = "2024-03-02"
const LATEST_TTL_MS = 60 * 60 * 1000

const providerUrls = (tag: string) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.min.json`,
  `https://${tag}.currency-api.pages.dev/v1/currencies/usd.min.json`,
]

function fetchFromProvider(tag: IsoDate | "latest") {
  const attempt = (url: string) =>
    Effect.tryPromise({
      try: async (signal) => {
        const res = await fetch(url, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        })
        if (!res.ok) throw new Error(`${url} responded ${res.status}`)
        const body = (await res.json()) as { date: string; usd: Record<string, number> }
        const rates: Rates = { USD: 1 }
        for (const code of CURRENCIES) {
          const rate = body.usd[code.toLowerCase()]
          if (rate) rates[code] = rate
        }
        return { date: body.date, rates }
      },
      catch: (cause) => new RatesError({ cause }),
    })
  return Effect.firstSuccessOf(providerUrls(tag).map(attempt))
}

export const ExchangeRatesLive = Layer.effect(
  ExchangeRates,
  Effect.gen(function* () {
    const db = yield* Db
    let latest: { at: number; rates: Rates } | undefined

    const save = (date: IsoDate, rates: Rates) =>
      db.query((db) => db.insert(schema.exchangeRate).values({ date, rates }).onConflictDoNothing())

    /** The cached day closest to `date` — the stand-in when the provider is down. */
    const closestCached = (date: IsoDate) =>
      db
        .query((db) =>
          db
            .select({ rates: schema.exchangeRate.rates })
            .from(schema.exchangeRate)
            .orderBy(sql`abs(${schema.exchangeRate.date} - ${date}::date)`)
            .limit(1),
        )
        .pipe(Effect.map(([row]) => row?.rates))

    const withFallback = (date: IsoDate, fetched: Effect.Effect<Rates, RatesError>) =>
      fetched.pipe(
        Effect.catchTag("RatesError", (error) =>
          closestCached(date).pipe(
            Effect.flatMap((rates) => (rates ? Effect.succeed(rates) : Effect.fail(error))),
            Effect.tap(() =>
              Effect.logWarning(`Exchange rates for ${date} unavailable, using closest cached day`),
            ),
          ),
        ),
      )

    const latestRates = Effect.suspend(() => {
      if (latest && Date.now() - latest.at < LATEST_TTL_MS) return Effect.succeed(latest.rates)
      return withFallback(
        today(),
        fetchFromProvider("latest").pipe(
          Effect.tap(({ date, rates }) => {
            latest = { at: Date.now(), rates }
            return save(date, rates).pipe(Effect.ignore)
          }),
          Effect.map(({ rates }) => rates),
        ),
      )
    })

    const forDates = (dates: Iterable<IsoDate>) =>
      Effect.gen(function* () {
        const now = today()
        // Normalize each requested date to the day whose rates we'll actually use.
        const keyOf = (date: IsoDate) =>
          date >= now ? "latest" : date < PROVIDER_FIRST_DAY ? PROVIDER_FIRST_DAY : date
        const requested = new Set(dates)
        const keys = new Set([...requested].map(keyOf))
        const historical = [...keys].filter((key) => key !== "latest")

        const byKey = new Map<string, Rates>()
        if (historical.length > 0) {
          const rows = yield* db.query((db) =>
            db
              .select()
              .from(schema.exchangeRate)
              .where(inArray(schema.exchangeRate.date, historical)),
          )
          for (const row of rows) byKey.set(row.date, row.rates)
        }
        if (keys.has("latest")) byKey.set("latest", yield* latestRates)

        const missing = historical.filter((key) => !byKey.has(key))
        yield* Effect.forEach(
          missing,
          (date) =>
            withFallback(
              date,
              fetchFromProvider(date).pipe(
                Effect.tap(({ rates }) => save(date, rates).pipe(Effect.ignore)),
                Effect.map(({ rates }) => rates),
              ),
            ).pipe(Effect.tap((rates) => Effect.sync(() => byKey.set(date, rates)))),
          { concurrency: 8, discard: true },
        )

        return new Map([...requested].map((date) => [date, byKey.get(keyOf(date))!]))
      })

    return { forDates }
  }),
)

/** Runs Effects from Promise-land (Hono handlers, Better Auth callbacks). */
export const runtime = ManagedRuntime.make(
  Layer.mergeAll(DbLive, ExchangeRatesLive.pipe(Layer.provide(DbLive))),
)
