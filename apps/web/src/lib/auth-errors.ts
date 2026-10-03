type AuthError = { code?: string; status?: number; message?: string }

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
}

export function authErrorMessage(error: unknown): string {
  const e = (error ?? {}) as AuthError
  if (e.status === 429) return "Too many attempts. Wait a minute and try again."
  return (e.code && messages[e.code]) || e.message || "Something went wrong. Try again."
}

/** Better Auth client calls return `{ data, error }` — turn errors into throws for React Query. */
export async function unwrap<T>(
  promise: Promise<{ data: T; error: null } | { data: null; error: AuthError }>,
) {
  const { data, error } = await promise
  if (error) throw error
  return data as T
}
