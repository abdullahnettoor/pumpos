import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/**
 * EmptyState — the "nothing here yet" surface. Two densities: `compact`
 * (inline dashed strip for panels/drawers) and default (centered block for
 * full-page/section emptiness). Teaches the next action rather than just
 * saying "empty".
 */

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** A Button or link. */
  action?: ReactNode;
  compact?: boolean;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { className, icon, title, description, action, compact = false, ...rest },
  ref
) {
  if (compact) {
    return (
      <div
        ref={ref}
        className={cn('flex items-center gap-3 rounded-card border border-dashed border-border-strong bg-canvas px-4 py-3.5', className)}
        {...rest}
      >
        {icon && (
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-soft bg-surface text-ink-muted [&_svg]:size-4" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-ink-strong">{title}</div>
          {description && <div className="text-[11.5px] leading-snug text-ink-muted">{description}</div>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}
      {...rest}
    >
      {icon && (
        <span className="mb-1 inline-flex size-11 items-center justify-center rounded-xl border border-border-soft bg-surface-alt text-ink-muted [&_svg]:size-5" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="text-[14px] font-semibold text-ink-strong">{title}</div>
      {description && <div className="max-w-[380px] text-[12.5px] leading-relaxed text-ink-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
});
