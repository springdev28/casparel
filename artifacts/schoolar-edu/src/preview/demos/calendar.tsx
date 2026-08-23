/**
 * @fileOverview Design-system role: implements or demonstrates Calendar in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
import { useState } from 'react';
import { Calendar } from '../../components/ui/calendar';

export function CalendarDemo() {
  const [selected, setSelected] = useState<Date | undefined>(
    new Date(2026, 6, 20),
  );

  return (
    <div className="w-fit rounded-xl border bg-card p-3">
      <Calendar
        mode="single"
        defaultMonth={new Date(2026, 6, 1)}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
