import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import type { ReactNode } from "react"

/** Title, an optional one-line caption, and a way through to the full section. */
export function CardHeader({
  id,
  title,
  caption,
  to,
  linkLabel,
  dark = false,
}: {
  id: string
  title: ReactNode
  caption?: ReactNode
  to: "/board" | "/finances" | "/net-worth" | "/projects"
  linkLabel: string
  dark?: boolean
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="grid gap-1">
        <h2 id={id} className="text-display-xs">
          {title}
        </h2>
        {caption ? (
          <p className={dark ? "text-body-sm text-canvas-soft/70" : "text-body-sm text-body"}>
            {caption}
          </p>
        ) : null}
      </div>
      <Link
        to={to}
        aria-label={linkLabel}
        title={linkLabel}
        className={
          dark
            ? "grid size-10 shrink-0 place-items-center rounded-full text-canvas-soft transition-colors duration-150 ease-out hover:bg-canvas-soft/10 focus-visible:ring-[3px] focus-visible:ring-canvas-soft/30 focus-visible:outline-none"
            : "grid size-10 shrink-0 place-items-center rounded-full bg-canvas transition-colors duration-150 ease-out hover:bg-wise-green-pale focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none"
        }
      >
        <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </header>
  )
}
