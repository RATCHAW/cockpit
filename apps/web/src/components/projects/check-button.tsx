import { cn } from "@cockpit/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import type { ComponentProps } from "react"

/**
 * Round toggle for marking something done. Checking is frequent, so only the colour changes —
 * plus the standard press feedback.
 */
export function CheckButton({
  checked,
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"button">, "type" | "role"> & { checked: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-150 ease-out motion-safe:active:scale-[0.92]",
        "focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none disabled:opacity-50",
        size === "md" ? "size-10 [&>svg]:size-5" : "size-8 [&>svg]:size-4",
        checked
          ? "border-ink bg-ink text-canvas"
          : "border-mute/60 bg-canvas text-transparent hover:border-ink hover:text-mute",
        className,
      )}
      {...props}
    >
      <CheckIcon strokeWidth={3} aria-hidden />
    </button>
  )
}
