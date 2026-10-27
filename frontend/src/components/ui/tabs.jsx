'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

function Tabs({ className, ...props }) {
    return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

function TabsList({ className, ...props }) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            className={cn(
                'bg-secondary/60 text-muted-foreground inline-flex h-11 max-w-full overflow-x-auto no-scrollbar items-center justify-start sm:justify-center rounded-2xl p-1 border border-border/80 gap-1',
                className
            )}
            {...props}
        />
    );
}

function TabsTrigger({ className, ...props }) {
    return (
        <TabsPrimitive.Trigger
            data-slot="tabs-trigger"
            className={cn(
                "data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-xs text-foreground/80 hover:text-foreground inline-flex h-full flex-1 items-center justify-center gap-2 rounded-xl px-4 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer [&_svg]:size-4",
                className
            )}
            {...props}
        />
    );
}

function TabsContent({ className, ...props }) {
    return (
        <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />
    );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
