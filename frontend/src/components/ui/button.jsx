import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2 active:scale-[0.98] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive select-none cursor-pointer max-w-full",
    {
        variants: {
            variant: {
                default: 'bg-primary text-white shadow-xs hover:bg-[#0f766e] hover:shadow-sm focus-visible:ring-primary/40',
                destructive:
                    'bg-rose-600 text-white shadow-xs hover:bg-rose-700 focus-visible:ring-rose-500/30 dark:bg-rose-600 dark:hover:bg-rose-700',
                outline:
                    'border border-border/80 bg-background/80 shadow-2xs hover:bg-teal-50/70 dark:hover:bg-teal-950/40 hover:border-teal-500/50 hover:text-teal-700 dark:hover:text-teal-300 text-foreground',
                secondary: 'bg-secondary text-secondary-foreground shadow-2xs hover:bg-secondary/80 hover:text-foreground border border-border/50',
                ghost: 'hover:bg-teal-50/70 dark:hover:bg-teal-950/40 hover:text-teal-700 dark:hover:text-teal-300 text-foreground/90',
                link: 'text-primary underline-offset-4 hover:underline hover:text-teal-700 dark:hover:text-teal-300'
            },
            size: {
                default: 'h-9 sm:h-10 lg:h-10.5 px-3.5 sm:px-4.5 lg:px-5 py-2 text-xs sm:text-sm font-medium has-[>svg]:px-3 sm:has-[>svg]:px-3.5 lg:has-[>svg]:px-4',
                sm: 'h-8 sm:h-8.5 lg:h-9 rounded-lg sm:rounded-xl gap-1.5 px-2.5 sm:px-3 lg:px-3.5 text-xs sm:text-xs lg:text-sm font-medium has-[>svg]:px-2 sm:has-[>svg]:px-2.5',
                lg: 'h-10 sm:h-11 lg:h-12 rounded-xl sm:rounded-2xl px-4.5 sm:px-6 lg:px-7 text-sm sm:text-base font-semibold sm:font-bold has-[>svg]:px-3.5 sm:has-[>svg]:px-4.5',
                icon: 'size-8.5 sm:size-9 lg:size-10 rounded-xl hover:border-teal-500/40'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
);

function Button({
    className,
    variant,
    size,
    asChild = false,
    ...props
}) {
    const Comp = asChild ? Slot : 'button';

    return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
