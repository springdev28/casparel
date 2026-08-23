/**
 * @fileOverview Design-system role: implements or demonstrates Spinner in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { Row } from '../parts';

export function SpinnerDemo() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Row label="Sizes and context">
        <Spinner className="size-4" />
        <Spinner className="size-6" />
        <Spinner className="size-8" />
        <Button disabled>
          <Spinner /> Saving
        </Button>
      </Row>
    </div>
  );
}
