import * as React from 'react';
import { cn } from '@/lib/utils';
import { validateField, sanitizeInput } from '@/lib/validation';

const Input = React.forwardRef(function Input({
    className,
    type = 'text',
    value,
    defaultValue,
    onChange,
    onBlur,
    validationOptions,
    showValidationMessage = false,
    errorMessage,
    ...props
}, ref) {
    const generatedId = React.useId();
    const resolvedId = props.id || `input-${generatedId.replace(/[:]/g, '')}`;
    const resolvedName = props.name || resolvedId;
    const resolvedAutoComplete = props.autoComplete ?? (type === 'file' ? undefined : 'off');

    const [validationError, setValidationError] = React.useState(null);
    const [touched, setTouched] = React.useState(false);

    const handleBlur = (e) => {
        setTouched(true);
        const val = e.target.value;
        if (val) {
            const check = validateField(val, {
                type,
                label: props['aria-label'] || props.placeholder || 'Field',
                ...validationOptions,
            });
            setValidationError(check.valid ? null : check.error);
        } else {
            setValidationError(null);
        }
        if (onBlur) onBlur(e);
    };

    const handleChange = (e) => {
        // Sanitize dangerous script injection strings in real-time
        if (typeof e.target.value === 'string' && /<script|javascript:/i.test(e.target.value)) {
            e.target.value = sanitizeInput(e.target.value);
        }

        if (touched) {
            const val = e.target.value;
            if (val) {
                const check = validateField(val, {
                    type,
                    label: props['aria-label'] || props.placeholder || 'Field',
                    ...validationOptions,
                });
                setValidationError(check.valid ? null : check.error);
            } else {
                setValidationError(null);
            }
        }
        if (onChange) onChange(e);
    };

    const hasError = Boolean(errorMessage || (touched && validationError));
    const activeError = errorMessage || validationError;

    return (
        <div className="relative w-full">
            <input
                ref={ref}
                type={type}
                id={resolvedId}
                name={resolvedName}
                autoComplete={resolvedAutoComplete}
                value={value}
                defaultValue={defaultValue}
                onChange={handleChange}
                onBlur={handleBlur}
                aria-invalid={hasError || props['aria-invalid']}
                title={hasError ? activeError : props.title}
                data-slot="input"
                className={cn(
                    'file:text-foreground placeholder:text-muted-foreground/70 selection:bg-primary selection:text-white border-border/80 flex h-10 w-full min-w-0 rounded-xl border bg-background/80 px-3.5 py-2 text-sm shadow-2xs transition-all outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                    'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
                    hasError && 'border-rose-500 focus-visible:border-rose-500 focus-visible:ring-rose-500/20 text-rose-500',
                    className
                )}
                {...props}
            />
            {showValidationMessage && hasError && (
                <p className="text-[11px] font-medium text-rose-500 mt-1 pl-1 animate-in fade-in-50 duration-200">
                    {activeError}
                </p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export { Input };
