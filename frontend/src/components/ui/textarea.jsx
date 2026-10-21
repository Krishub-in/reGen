import * as React from 'react';
import { cn } from '@/lib/utils';
import { sanitizeInput } from '@/lib/validation';

const Textarea = React.forwardRef(function Textarea({ className, onChange, maxLength = 5000, ...props }, ref) {
    const handleChange = (e) => {
        if (typeof e.target.value === 'string' && /<script|javascript:/i.test(e.target.value)) {
            e.target.value = sanitizeInput(e.target.value);
        }
        if (onChange) onChange(e);
    };

    return (
        <textarea
            ref={ref}
            data-slot="textarea"
            maxLength={maxLength}
            onChange={handleChange}
            className={cn(
                'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                className
            )}
            {...props}
        />
    );
});

Textarea.displayName = 'Textarea';

export { Textarea };
