import { render } from "@react-email/render"
import { createElement } from "react"
import { Resend } from "resend"

import { ActionEmail, type ActionEmailProps } from "./templates/action-email"

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

async function renderAction(props: ActionEmailProps) {
  const element = createElement(ActionEmail, props)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { html, text }
}

export async function verifyEmailMessage(to: string, url: string): Promise<EmailMessage> {
  return {
    to,
    subject: "Verify your email",
    ...(await renderAction({
      preview: "Verify your email to finish setting up Cockpit",
      heading: "Confirm your email",
      body: "Tap the button below to verify your address and open your cockpit.",
      actionLabel: "Verify email",
      actionUrl: url,
      footnote: "If you didn't create an account, you can ignore this email.",
    })),
  }
}

export async function resetPasswordMessage(to: string, url: string): Promise<EmailMessage> {
  return {
    to,
    subject: "Reset your password",
    ...(await renderAction({
      preview: "Reset your Cockpit password",
      heading: "Reset your password",
      body: "Someone asked to reset the password for this account. The link expires in 30 minutes.",
      actionLabel: "Choose a new password",
      actionUrl: url,
      footnote: "If this wasn't you, ignore this email. Your password won't change.",
    })),
  }
}

export type MailerConfig = {
  /** When missing, emails are logged to the console instead of sent. */
  resendApiKey?: string
  from: string
}

export function createMailer({ resendApiKey, from }: MailerConfig) {
  const resend = resendApiKey ? new Resend(resendApiKey) : null

  return async function send(message: EmailMessage) {
    if (!resend) {
      console.info(`\n[email] to=${message.to} subject="${message.subject}"\n${message.text}\n`)
      return
    }
    const { error } = await resend.emails.send({ from, ...message })
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`)
  }
}

export type Mailer = ReturnType<typeof createMailer>
