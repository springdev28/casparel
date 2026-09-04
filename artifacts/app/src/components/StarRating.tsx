/**
 * @fileOverview Web UI role: provides the reusable Star Rating component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@workspace/edu-ds/lib/utils';
import { playFeedback } from '../lib/feedback';

interface StarRatingProps {
  value: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function StarRating({ value, max = 5, onChange, size = 'md', className }: StarRatingProps) {
  const iconSize = size === 'sm' ? 14 : 18;
  const [justClicked, setJustClicked] = useState<number | null>(null);

  return (
    <div className={cn('flex items-center gap-0.5', className)} role="group" aria-label={`Rating: ${value} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.round(value);
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (!onChange) return;
              onChange(i + 1);
              playFeedback('pop', { pitch: (i + 1) / max });
              setJustClicked(i);
            }}
            className={cn(
              'focus:outline-none transition-colors',
              onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default pointer-events-none',
            )}
            aria-label={`${i + 1} star${i + 1 !== 1 ? 's' : ''}`}
            data-testid={`star-${i + 1}`}
          >
            <Star
              size={iconSize}
              className={cn(
                filled ? 'fill-amber-400 text-amber-400' : 'fill-none text-muted-foreground',
                justClicked === i && 'feedback-pop',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
