/**
 * @fileOverview Web UI role: provides the reusable Auth Language Select component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { Languages } from 'lucide-react';
import { AUTH_LANGUAGES, type AuthLanguage } from '../lib/auth-locale';

export function AuthLanguageSelect({ language, label, onChange, className = '' }: {
  language: AuthLanguage;
  label: string;
  onChange: (language: AuthLanguage) => void;
  className?: string;
}) {
  return (
    <label className={`inline-flex min-w-0 max-w-full items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <Languages size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <select
        value={language}
        onChange={(event) => onChange(event.target.value as AuthLanguage)}
        aria-label={label}
        data-testid="language-select"
        className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {AUTH_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
