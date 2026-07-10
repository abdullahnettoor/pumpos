import React, { forwardRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn.js';

/**
 * Panel — a titled surface card. Header (title + optional icon + right action)
 * over a body, with an optional footer. Replaces the ad-hoc `.card` + inline
 * header spans scattered across screens. The body is padded by default; pass
 * `flush` for full-bleed content (tables, lists that own their own padding).
 *
 * Pass `collapsible` to make the header a toggle that shows/hides the body
 * (and footer) — useful for dense surfaces (e.g. the dashboard exceptions
 * list) that shouldn't dominate the page when long. When collapsible, keep
 * the `action` slot non-interactive (it lives inside the header toggle button).
 */

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  /** Small leading icon next to the title. */
  icon?: ReactNode;
  /** Right-aligned header slot (chip, count). Non-interactive when collapsible. */
  action?: ReactNode;
  footer?: ReactNode;
  /** Remove body padding (for tables / self-padded content). */
  flush?: boolean;
  /** Make the header a show/hide toggle for the body. */
  collapsible?: boolean;
  /** Start collapsed (only meaningful with `collapsible`). */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { className, title, icon, action, footer, flush = false, collapsible = false, defaultCollapsed = false, children, ...rest },
  ref
) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const hasHeader = title != null || action != null || icon != null;
  const showBody = !collapsible || open;

  const headerInner = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="inline-flex size-4 items-center justify-center text-ink-muted [&_svg]:size-4" aria-hidden="true">{icon}</span>}
        {title && <span className="truncate text-[12px] font-semibold uppercase tracking-wider text-ink-muted">{title}</span>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {action}
        {collapsible && <ChevronDown className={cn('size-4 text-ink-faint transition-transform duration-150', open && 'rotate-180')} aria-hidden="true" />}
      </div>
    </>
  );

  return (
    <div
      ref={ref}
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-card border border-border-soft bg-surface', className)}
      {...rest}
    >
      {hasHeader && (
        collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={cn(
              'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-alt',
              showBody && 'border-b border-border-soft',
            )}
          >
            {headerInner}
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-2.5">
            {headerInner}
          </div>
        )
      )}
      {showBody && <div className={cn('min-w-0 flex-1', !flush && 'p-4')}>{children}</div>}
      {showBody && footer && <div className="border-t border-border-soft px-4 py-2.5">{footer}</div>}
    </div>
  );
});

