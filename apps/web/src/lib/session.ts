import { queryOptions } from "@tanstack/react-query"

import { authClient } from "./auth-client"

export const sessionQueryOptions = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession()
    if (error) throw error
    return data
  },
  staleTime: 60_000,
})

/** Only allow same-origin relative paths as post-login redirects. */
export function safeRedirect(path: string | undefined) {
  return path && path.startsWith("/") && !path.startsWith("//") ? path : "/"
}
