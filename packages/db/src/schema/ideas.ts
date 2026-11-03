import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { user } from "./auth"

export const idea = pgTable(
  "idea",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text().notNull(),
    archived: boolean().notNull().default(false),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
)
