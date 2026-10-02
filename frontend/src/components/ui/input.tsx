import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onChange, onFocus, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-[38px] w-full rounded-md border border-input bg-secondary px-3 py-1 text-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-brand focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-brand/15',
        'disabled:cursor-not-allowed disabled:opacity-60 read-only:opacity-70',
        className,
      )}
      /* number fields: typing over a 0 must not leave "025" behind — strip leading zeros, select the 0 on focus, ignore wheel scroll */
      onChange={type === 'number' ? (e) => { const v = e.target.value; if (/^-?0\d/.test(v)) e.target.value = v.replace(/^(-?)0+(?=\d)/, '$1'); onChange?.(e); } : onChange}
      onFocus={type === 'number' ? (e) => { if (e.target.value === '0') e.target.select(); onFocus?.(e); } : onFocus}
      onWheel={type === 'number' ? (e) => (e.target as HTMLInputElement).blur() : undefined}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
export { Input };
