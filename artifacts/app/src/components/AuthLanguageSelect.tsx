import { Languages } from 'lucide-react';
import { AUTH_LANGUAGES, type AuthLanguage } from '../lib/auth-locale';

export function AuthLanguageSelect({ language, label, onChange }: {
  language: AuthLanguage;
  label: string;
  onChange: (language: AuthLanguage) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Languages size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <select
        value={language}
        onChange={(event) => onChange(event.target.value as AuthLanguage)}
        aria-label={label}
        data-testid="language-select"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {AUTH_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
