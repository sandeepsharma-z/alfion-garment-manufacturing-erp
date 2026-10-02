import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 active:translate-y-px',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-brand to-violet text-white shadow-[0_8px_20px_-10px_rgba(160,90,255,.75)] hover:brightness-105 hover:-translate-y-px',
        secondary: 'border bg-card text-foreground shadow-sm hover:border-brand hover:text-brand hover:bg-brand-soft dark:hover:bg-accent hover:-translate-y-px',
        ghost: 'hover:bg-secondary hover:text-foreground text-muted-foreground',
        destructive: 'border bg-card text-foreground shadow-sm hover:border-bad hover:text-bad hover:bg-bad-soft',
        ink: 'bg-ink text-white hover:bg-ink/90',
      },
      size: {
        default: 'h-9.5 h-[38px] px-4',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-6',
        icon: 'h-9.5 h-[38px] w-[38px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
