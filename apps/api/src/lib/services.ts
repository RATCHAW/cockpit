import { createDb, type Database } from "@cockpit/db"
import { createMailer, type EmailMessage } from "@cockpit/email"
import { sql } from "drizzle-orm"
import { Context, Data, Effect, Layer, ManagedRuntime, Option, Redacted } from "effect"

import { config } from "./config"

export class DatabaseError extends Data.TaggedError("DatabaseError")<{ cause: unknown }> {}
export class EmailError extends Data.TaggedError("EmailError")<{ cause: unknown }> {}

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

export class Mailer extends Context.Service<
  Mailer,
  { readonly send: (message: EmailMessage) => Effect.Effect<void, EmailError> }
>()("cockpit/Mailer") {}

export const MailerLive = Layer.sync(Mailer, () => {
  const send = createMailer({
    resendApiKey: Option.getOrUndefined(Option.map(config.resendApiKey, Redacted.value)),
    from: config.emailFrom,
  })
  return {
    send: (message) =>
      Effect.tryPromise({ try: () => send(message), catch: (cause) => new EmailError({ cause }) }),
  }
})

/** Runs Effects from Promise-land (Hono handlers, Better Auth callbacks). */
export const runtime = ManagedRuntime.make(Layer.mergeAll(DbLive, MailerLive))
