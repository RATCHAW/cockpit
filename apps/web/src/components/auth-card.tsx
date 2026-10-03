import type { ReactNode } from "react"

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-xl bg-card p-6 sm:p-8">
        <header className="grid gap-2">
          <h2 className="text-display-sm">{title}</h2>
          {description ? <p className="text-body-md text-body">{description}</p> : null}
        </header>
        {children}
      </section>
      {footer ? <p className="text-center text-body-sm text-body">{footer}</p> : null}
    </div>
  )
}
