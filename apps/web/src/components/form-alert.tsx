import { cn } from "@cockpit/ui/lib/utils"
import { CircleAlertIcon, MailCheckIcon } from "lucide-react"
import type { ReactNode } from "react"

/** Form-level message. Announced to screen readers; enters with a short ease-out fade. */
export function FormAlert({
  tone = "negative",
  children,
}: {
  tone?: "negative" | "positive"
  children: ReactNode
}) {
  const Icon = tone === "negative" ? CircleAlertIcon : MailCheckIcon
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md px-4 py-3 text-body-sm font-semibold",
        "animate-in duration-200 ease-out fade-in motion-safe:slide-in-from-top-1",
        tone === "negative" ? "bg-negative-bg text-white" : "bg-wise-green-pale text-positive-deep",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}
