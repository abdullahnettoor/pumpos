import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/**
 * Panel — a titled surface card. Header (title + optional icon + right action)
 * over a body, with an optional footer. Replaces the ad-hoc `.card` + inline
 * header spans scattered across screens. The body is padded by default; pass
 * `flush` for full-bleed content (tables, lists that own their own padding).
 */

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  /** Small leading icon next to the title. */
  icon?: ReactNode;
  /** Right-aligned header slot (action button, chip, menu). */
  action?: ReactNode;
  footer?: ReactNode;
  /** Remove body padding (for tables / self-padded content). */
  flush?: boolean;
  children: ReactNode;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { className, title, icon, action, footer, flush = false, children, ...rest },
  ref
) {
  const hasHeader = title != null || action != null || icon != null;
  return (
    <div
      ref={ref}
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-card border border-border-soft bg-surface', className)}
      {...rest}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="inline-flex size-4 items-center justify-center text-ink-muted [&_svg]:size-4" aria-hidden="true">{icon}</span>}
            {title && <span className="truncate text-[12px] font-semibold uppercase tracking-wider text-ink-muted">{title}</span>}
          </div>
          {action && <div className="flex flex-shrink-0 items-center gap-1.5">{action}</div>}
        </div>
      )}
      <div className={cn('min-w-0 flex-1', !flush && 'p-4')}>{children}</div>
      {footer && <div className="border-t border-border-soft px-4 py-2.5">{footer}</div>}
    </div>
  );
});
