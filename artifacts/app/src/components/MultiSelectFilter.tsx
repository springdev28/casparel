/**
 * A filter that accepts more than one answer.
 *
 * Most of the filter panel was single-select, which quietly turned a question
 * into the wrong question: a reader who wants something to watch *or* read had
 * to search twice and compare two pages by hand, and there was no way at all to
 * ask for two subjects. Anything whose values are alternatives rather than a
 * ladder belongs here.
 *
 * The value is a comma-separated string rather than an array because that is
 * what the search sends, what the recent-search history stores and what the URL
 * would carry — keeping one representation end to end means there is nowhere for
 * an array and a string to disagree.
 */
import { useMemo } from "react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Checkbox } from "@workspace/edu-ds/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/edu-ds/components/ui/popover";
import { ChevronDown } from "lucide-react";

export type MultiSelectOption = { value: string; label: string };

export function splitFilterValues(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function MultiSelectFilter({
  value,
  onChange,
  options,
  label,
  allLabel,
  className,
  testId,
}: {
  value: string;
  onChange: (next: string) => void;
  options: MultiSelectOption[];
  /** Accessible name; also what the trigger says when several are chosen. */
  label: string;
  /** What the trigger says when nothing is chosen. */
  allLabel: string;
  className?: string;
  testId?: string;
}) {
  const selected = useMemo(() => splitFilterValues(value), [value]);

  function toggle(option: string) {
    const next = selected.includes(option)
      ? selected.filter((entry) => entry !== option)
      : [...selected, option];
    onChange(next.join(","));
  }

  // One choice reads better as itself than as "1 selected"; several would not
  // fit, so they are counted.
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ??
          selected[0])
        : `${selected.length} ${label.toLowerCase()}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={label}
          data-testid={testId}
          className={`justify-between font-normal ${className ?? ""}`}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown size={14} className="ml-1.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5">
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(option.value)}
                  aria-label={option.label}
                />
                <span className="capitalize">{option.label}</span>
              </label>
            );
          })}
        </div>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 w-full text-xs"
            onClick={() => onChange("")}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
