import { z } from "zod"

export const email = z.email("Enter a valid email address.")
export const newPassword = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(256, "That's a bit long — 256 characters max.")

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
})

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "What should we call you?"),
  email,
  password: newPassword,
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  })
