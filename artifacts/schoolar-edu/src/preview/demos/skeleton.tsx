/**
 * @fileOverview Design-system role: implements or demonstrates Skeleton in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
import { Skeleton } from '../../components/ui/skeleton';

export function SkeletonDemo() {
  return (
    <div className="flex max-w-md items-center gap-4 rounded-xl border bg-card p-6">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
