import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString })
  return drizzle({ client: pool, schema, casing: "snake_case" })
}

export type Database = ReturnType<typeof createDb>

export { schema }
