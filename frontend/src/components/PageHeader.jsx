import React from 'react';
import { cn } from '@/lib/utils';

export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#D5E5D7] dark:border-[#2A3D48]", className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-11 h-11 rounded-2xl bg-[#15966A]/10 text-[#15966A] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#183B2B] dark:text-[#E8F0F4] leading-snug">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[#687C70] dark:text-[#A6B5C0] mt-0.5 font-normal">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
