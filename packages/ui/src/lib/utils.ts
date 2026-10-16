import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge only knows Tailwind's default type scale, so it would read `text-caption` or
 * `text-body-sm` as colours and drop them next to `text-ink`. Keep this list in sync with the
 * `--text-*` sizes in `styles/globals.css`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-mega",
            "display-xxl",
            "display-xl",
            "display-md",
            "display-sm",
            "display-xs",
            "body-lg",
            "body-md",
            "body-sm",
            "caption",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
