import { Config, Effect, Redacted } from "effect"

if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url))
  } catch {
    // No root .env — fall back to the process environment.
  }
}

const AppConfig = Config.all({
  nodeEnv: Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
    Config.withDefault("development"),
  ),
  port: Config.Port("API_PORT").pipe(Config.withDefault(3000)),
  databaseUrl: Config.Redacted("DATABASE_URL"),
  authSecret: Config.Redacted("BETTER_AUTH_SECRET"),
  authUrl: Config.URL("BETTER_AUTH_URL"),
  webUrl: Config.URL("WEB_URL"),
})

/** Validated environment. Throws at startup with every missing/invalid key listed. */
export const config = (() => {
  try {
    return Effect.runSync(AppConfig)
  } catch (error) {
    throw new Error(`Invalid environment: ${(error as Error).message}`, { cause: error })
  }
})()

export { Redacted }
