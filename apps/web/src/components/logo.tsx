import { cn } from "@cockpit/ui/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <circle cx="16" cy="16" r="16" fill="var(--wise-green)" />
      <path
        d="M16 8.5a7.5 7.5 0 1 0 6.5 11.25"
        fill="none"
        stroke="var(--ink-deep)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.5" fill="var(--ink-deep)" />
    </svg>
  )
}

export function Logo({ className, tone = "ink" }: { className?: string; tone?: "ink" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span
        className={cn(
          "font-display text-xl font-extrabold tracking-tight",
          tone === "light" ? "text-canvas-soft" : "text-ink",
        )}
      >
        Cockpit
      </span>
    </span>
  )
}
