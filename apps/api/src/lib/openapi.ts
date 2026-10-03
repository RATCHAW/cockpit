import { z } from "@hono/zod-openapi"
import { Data } from "effect"

/** Building blocks shared by every router's OpenAPI definitions. */

export class NotFoundError extends Data.TaggedError("NotFoundError")<{ entity: string }> {}

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error")

export const IsoDateSchema = z.iso.date().openapi({ example: "2026-10-03" })

export const IdParamSchema = z.object({ id: z.uuid() })

export const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorSchema } },
})

export const jsonContent = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})
