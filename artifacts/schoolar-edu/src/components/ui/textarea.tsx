/**
 * @fileOverview Design-system primitive role: implements the reusable Textarea UI primitive.
 * System connection: exported through @workspace/edu-ds and composed by product-specific web components and pages.
 */
import * as React from "react"

import { cn } from "../../lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        /*
         * `supports-[backdrop-filter]:bg-*` outlives a caller's own background.
         *
         * tailwind-merge drops the plain `bg-*` above when a caller passes one --
         * they are the same utility and conflict -- and keeps this, because a
         * class with a variant and one without are different utilities to it. So
         * a caller writing `bg-transparent` gets a transparent background on
         * browsers without backdrop-filter and this one everywhere else.
         *
         * It cost a real bug: the sidebar's role switcher painted itself
         * near-white under its own near-white text. A caller that means it has to
         * say `supports-[backdrop-filter]:bg-transparent` too, or use `!bg-`.
         */
        "flex min-h-[60px] w-full rounded-md border border-input bg-card/90 px-3 py-2 text-base text-card-foreground backdrop-blur-md supports-[backdrop-filter]:bg-card/80 shadow-sm placeholder:text-card-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
