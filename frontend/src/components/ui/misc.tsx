/* Small shadcn-style primitives kept together: Label, Badge, Skeleton, Checkbox, Table */
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Check } from '@/icons/icons';

/* ---------- Label ---------- */
export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground', className)}
    {...props}
  />
));
Label.displayName = 'Label';

/* ---------- Badge / status pill ---------- */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap before:h-[5px] before:w-[5px] before:rounded-full before:bg-current',
  {
    variants: {
      tone: {
        ok: 'bg-teal-soft text-teal dark:bg-teal/15',
        warn: 'bg-gold-soft text-gold dark:bg-gold-vivid/15 dark:text-gold-vivid',
        bad: 'bg-bad-soft text-bad dark:bg-bad/15 dark:text-[#ff7d90]',
        info: 'bg-info-soft text-info dark:bg-info/15',
        brand: 'bg-brand-soft text-brand dark:bg-accent',
        mute: 'bg-secondary text-muted-foreground',
        plain: 'before:hidden bg-secondary text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'mute' },
  },
);
export const Badge = ({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
);

/* ---------- Skeleton ---------- */
export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('animate-pulse rounded-md bg-secondary', className)} {...props} />
);

/* ---------- Checkbox ---------- */
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-[5px] border border-input bg-card shadow-sm',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'data-[state=checked]:bg-brand data-[state=checked]:border-brand data-[state=checked]:text-white',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check size={12} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

/* ---------- Table ---------- */
export const Table = ({ className, ...p }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('w-full caption-bottom text-[13px]', className)} {...p} />
  </div>
);
export const THead = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('[&_th]:sticky [&_th]:top-0', className)} {...p} />
);
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />;
export const Tr = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-b last:border-b-0 transition-colors hover:bg-brand-soft/40 dark:hover:bg-secondary', className)} {...p} />
);
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn(
      'bg-secondary px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground border-b whitespace-nowrap',
      className,
    )}
    {...p}
  />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-3 py-3 align-middle', className)} {...p} />
);
