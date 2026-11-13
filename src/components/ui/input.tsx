import * as React from 'react';
import { cn } from '@/src/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.08)] transition-shadow placeholder:text-slate-400 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgba(37,99,235,0.28),0_1px_2px_rgba(15,23,42,0.04)] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
