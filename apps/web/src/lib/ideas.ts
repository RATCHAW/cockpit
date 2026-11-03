import { queryOptions } from "@tanstack/react-query"
import { parseResponse, type InferResponseType } from "hono/client"

import { api } from "./api"

export type Idea = InferResponseType<typeof api.ideas.$get, 200>["items"][number]

export const ideasQueryOptions = queryOptions({
  queryKey: ["ideas"],
  queryFn: () => parseResponse(api.ideas.$get()),
})
