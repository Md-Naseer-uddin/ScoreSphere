import { cn } from '@/lib/utils';

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Large, thumb-sized single-choice buttons, announced as a radio group. */
export function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-2', columns === 2 && 'grid-cols-2')}
    >
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          disabled={c.disabled}
          onClick={() => onChange(c.value)}
          className={cn(
            'min-h-12 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
            value === c.value
              ? 'border-primary bg-primary/10 font-semibold'
              : 'bg-background hover:bg-muted',
          )}
        >
          <span className="block">{c.label}</span>
          {c.hint && (
            <span className="block text-xs font-normal text-muted-foreground">{c.hint}</span>
          )}
        </button>
      ))}
    </div>
  );
}
