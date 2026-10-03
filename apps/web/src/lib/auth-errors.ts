type AuthError = { code?: string; status?: number; message?: string }

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
  EMAIL_NOT_VERIFIED: "Verify your email first. We just sent you a fresh link.",
  USER_ALREADY_EXISTS: "An account with this email already exists.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists.",
  PASSWORD_TOO_SHORT: "Use at least 12 characters.",
  INVALID_TOKEN: "This link is invalid or has expired. Request a new one.",
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
