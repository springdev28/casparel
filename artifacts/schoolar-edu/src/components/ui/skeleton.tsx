/**
 * @fileOverview Design-system primitive role: implements the reusable Skeleton UI primitive.
 * System connection: exported through @workspace/edu-ds and composed by product-specific web components and pages.
 */
import { cn } from "../../lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
