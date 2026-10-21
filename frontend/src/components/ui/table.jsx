'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({ className, ...props }) {
    return (
        <div data-slot="table-container" tabIndex={0} role="region" aria-label="Data table" className="relative w-full overflow-x-auto min-w-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl">
            <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
        </div>
    );
}

function TableHeader({ className, ...props }) {
    return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

function TableBody({ className, ...props }) {
    return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ className, ...props }) {
    return (
        <tfoot
            data-slot="table-footer"
            className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)}
            {...props}
        />
    );
}

function TableRow({ className, ...props }) {
    return (
        <tr
            data-slot="table-row"
            className={cn(
                'border-b border-border/60 transition-colors hover:bg-teal-500/[0.04] dark:hover:bg-teal-400/[0.06] data-[state=selected]:bg-teal-500/10 dark:data-[state=selected]:bg-teal-500/15',
                className
            )}
            {...props}
        />
    );
}

function TableHead({ className, ...props }) {
    return (
        <th
            data-slot="table-head"
            className={cn(
                'text-muted-foreground font-semibold uppercase tracking-wider text-[13px] h-10 px-3 text-left align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
                className
            )}
            {...props}
        />
    );
}

function TableCell({ className, ...props }) {
    return (
        <td
            data-slot="table-cell"
            className={cn(
                'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
                className
            )}
            {...props}
        />
    );
}

function TableCaption({ className, ...props }) {
    return (
        <caption data-slot="table-caption" className={cn('text-muted-foreground mt-4 text-sm', className)} {...props} />
    );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
