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
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 sm:pb-4 border-b border-[#D5E5D7] dark:border-[#2A3D48]", className)}>
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        {Icon && (
          <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-xl sm:rounded-2xl bg-[#15966A]/10 text-[#15966A] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs">
            <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl lg:text-[26px] font-bold tracking-tight text-[#183B2B] dark:text-[#E8F0F4] leading-snug truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm lg:text-[15px] text-[#687C70] dark:text-[#A6B5C0] mt-0.5 font-normal line-clamp-1 sm:line-clamp-none">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 sm:gap-2.5 self-start sm:self-auto flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
