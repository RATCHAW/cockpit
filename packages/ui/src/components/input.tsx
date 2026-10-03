import * as React from "react"

import { cn } from "@cockpit/ui/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-md border border-input bg-canvas px-4 text-base text-ink transition-[border-color,box-shadow] duration-150 ease-out outline-none",
        "selection:bg-primary selection:text-primary-foreground placeholder:text-mute",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-[3px] focus-visible:ring-ink/15",
        "aria-invalid:border-negative aria-invalid:ring-[3px] aria-invalid:ring-negative/15",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
