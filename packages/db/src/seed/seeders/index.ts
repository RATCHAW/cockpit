import type { Seeder } from "../types"
import { financesSeeder } from "./finances"

/**
 * Feature seeders, run in order after the admin user is created.
 * Add one file per feature and register it here, for example:
 *
 * ```ts
 * import { seed } from "drizzle-seed"
 * import { transaction } from "../../schema"
 *
 * export const financesSeeder: Seeder = {
 *   name: "finances",
 *   run: ({ db, admin }) =>
 *     seed(db, { transaction }, { seed: 1 }).refine((f) => ({
 *       transaction: {
 *         count: 200,
 *         columns: {
 *           userId: f.default({ defaultValue: admin.id }),
 *           amount: f.number({ minValue: -500, maxValue: 3000, precision: 100 }),
 *         },
 *       },
 *     })),
 * }
 * ```
 */
export const seeders: Seeder[] = [financesSeeder]
