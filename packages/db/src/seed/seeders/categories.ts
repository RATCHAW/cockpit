import { addDefaultCategories } from "../../categories"
import type { Seeder } from "../types"

export const categoriesSeeder: Seeder = {
  name: "categories",
  run: ({ db, admin }) => addDefaultCategories(db, admin.id),
}
