import { reset } from "drizzle-seed"

import { createDb, schema } from "../index"
import { seedAdmin } from "./seeders/auth"
import { seeders } from "./seeders"

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed with NODE_ENV=production")
}

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")

const db = createDb(url)

try {
  if (process.argv.includes("--reset")) {
    console.log("Resetting database…")
    await reset(db, schema)
  }

  console.log("Seeding…")
  const admin = await seedAdmin(db)
  for (const seeder of seeders) {
    console.log(`  ${seeder.name}…`)
    await seeder.run({ db, admin })
  }
  console.log("Done.")
} finally {
  await db.$client.end()
}
