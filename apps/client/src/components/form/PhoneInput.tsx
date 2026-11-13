import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Indian mobile number entry: fixed +91 prefix and a numeric keypad (ADR 0025). */
export function PhoneInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className="flex">
      <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
        +91
      </span>
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={14}
        placeholder="98765 43210"
        className={cn('rounded-l-none', className)}
        {...props}
      />
    </div>
  );
}
