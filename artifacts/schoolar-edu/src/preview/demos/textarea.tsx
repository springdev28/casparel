/**
 * @fileOverview Design-system role: implements or demonstrates Textarea in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
import { Textarea } from '../../components/ui/textarea';
import { Stack } from '../parts';

export function TextareaDemo() {
  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6">
      <Stack label="Default">
        <Textarea placeholder="Add context for your team" />
      </Stack>
      <Stack label="States">
        <Textarea defaultValue="A concise project update." />
        <Textarea placeholder="Disabled" disabled />
      </Stack>
    </div>
  );
}
