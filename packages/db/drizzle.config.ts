import { defineConfig } from "drizzle-kit"

try {
  process.loadEnvFile("../../.env")
} catch {
  // Env vars may come from the environment instead (CI, Docker).
}

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  casing: "snake_case",
})
