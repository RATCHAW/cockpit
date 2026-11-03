import { eq } from "drizzle-orm"
import { seed } from "drizzle-seed"

import { idea } from "../../schema"
import type { Seeder } from "../types"

export const ideasSeeder: Seeder = {
  name: "ideas",
  run: async ({ db, admin }) => {
    const [existing] = await db
      .select({ id: idea.id })
      .from(idea)
      .where(eq(idea.userId, admin.id))
      .limit(1)
    if (existing) return

    await seed(db, { idea }, { seed: 42 }).refine((f) => ({
      idea: {
        count: 3,
        columns: {
          userId: f.default({ defaultValue: admin.id }),
          content: f.valuesFromArray({
            values: [
              "Build a small tool that turns my weekly notes into a progress update.",
              "Try a walking meeting for the next project brainstorm.",
              "Write about what I learned building Cockpit. Start with the hardest decision.",
            ],
            isUnique: true,
          }),
          archived: f.default({ defaultValue: false }),
          createdAt: f.default({ defaultValue: new Date() }),
          updatedAt: f.default({ defaultValue: new Date() }),
        },
      },
    }))
  },
}
