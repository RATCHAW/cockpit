/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "react-email"

export type ActionEmailProps = {
  preview: string
  heading: string
  body: string
  actionLabel: string
  actionUrl: string
  footnote: string
}

const colors = {
  primary: "#9fe870",
  inkDeep: "#163300",
  ink: "#0e0f0c",
  body: "#454745",
  mute: "#868685",
  canvas: "#ffffff",
  canvasSoft: "#e8ebe6",
}

const font = 'Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export function ActionEmail({
  preview,
  heading,
  body,
  actionLabel,
  actionUrl,
  footnote,
}: ActionEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.canvasSoft, fontFamily: font, padding: "48px 0" }}>
        <Container
          style={{
            backgroundColor: colors.canvas,
            borderRadius: 24,
            padding: 32,
            maxWidth: 480,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: 600, margin: 0 }}>
            Cockpit
          </Text>
          <Heading
            as="h1"
            style={{
              color: colors.ink,
              fontSize: 32,
              fontWeight: 900,
              lineHeight: "34px",
              margin: "24px 0 12px",
            }}
          >
            {heading}
          </Heading>
          <Text style={{ color: colors.body, fontSize: 16, lineHeight: "24px", margin: 0 }}>
            {body}
          </Text>
          <Section style={{ margin: "32px 0" }}>
            <Button
              href={actionUrl}
              style={{
                backgroundColor: colors.primary,
                color: colors.inkDeep,
                borderRadius: 24,
                fontSize: 16,
                fontWeight: 600,
                padding: "12px 24px",
              }}
            >
              {actionLabel}
            </Button>
          </Section>
          <Text style={{ color: colors.mute, fontSize: 12, lineHeight: "16px", margin: 0 }}>
            {footnote}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

ActionEmail.PreviewProps = {
  preview: "Verify your email to finish setting up Cockpit",
  heading: "Confirm your email",
  body: "Tap the button below to verify your address and open your cockpit.",
  actionLabel: "Verify email",
  actionUrl: "http://localhost:5173",
  footnote: "If you didn't create an account, you can ignore this email.",
} satisfies ActionEmailProps

export default ActionEmail
