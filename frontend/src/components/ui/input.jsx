import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
    const generatedId = React.useId();
    const resolvedId = props.id || `input-${generatedId.replace(/[:]/g, '')}`;
    const resolvedName = props.name || resolvedId;
    const resolvedAutoComplete = props.autoComplete ?? (type === 'file' ? undefined : 'off');

    return (
        <input
            type={type}
            id={resolvedId}
            name={resolvedName}
            autoComplete={resolvedAutoComplete}
            data-slot="input"
            className={cn(
                'file:text-foreground placeholder:text-muted-foreground/70 selection:bg-primary selection:text-white border-border/80 flex h-10 w-full min-w-0 rounded-xl border bg-background/80 px-3.5 py-2 text-sm shadow-2xs transition-all outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
                'aria-invalid:ring-rose-500/20 aria-invalid:border-rose-500',
                className
            )}
            {...props}
        />
    );
}

export { Input };
