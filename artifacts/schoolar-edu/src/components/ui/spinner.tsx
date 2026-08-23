/**
 * @fileOverview Design-system primitive role: implements the reusable Spinner UI primitive.
 * System connection: exported through @workspace/edu-ds and composed by product-specific web components and pages.
 */
import { Loader2Icon } from "lucide-react"

import { cn } from "../../lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
