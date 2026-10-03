import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@cockpit/ui/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none",
    // Press feedback: scale on :active confirms the interface heard the user.
    "transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97]",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        /** Wise green CTA pill — the single primary action on a surface. */
        default: "bg-primary text-primary-foreground hover:bg-wise-green-active",
        /** Sage-tinted secondary. */
        secondary: "bg-secondary text-secondary-foreground hover:bg-[#dde1da]",
        /** White outline tertiary — 1px ink border. */
        outline: "border border-ink bg-canvas text-ink hover:bg-canvas-soft",
        /** Polarity-flipped promo button — ink with Wise green text. */
        dark: "bg-ink text-primary hover:bg-[#262824]",
        ghost: "text-ink hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-negative-deep",
        link: "h-auto rounded-sm px-0 text-ink underline underline-offset-4 hover:decoration-2 active:scale-100",
      },
      size: {
        default: "h-12 px-6 text-base",
        sm: "h-10 px-4 text-sm",
        xs: "h-8 gap-1.5 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 px-8 text-lg",
        icon: "size-12 rounded-full",
        "icon-sm": "size-10 rounded-full [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-8 rounded-full [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
