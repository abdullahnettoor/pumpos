import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { BackLink, type BackLinkProps } from './BackLink.js';

/**
 * PageHeader — the consistent header for every screen. Title + optional
 * subtitle on the left; actions (buttons, segmented period toggles) on the
 * right; an optional `meta` row beneath the title for chips/breadcrumbs.
 * Reusable app-wide — the dashboard, list pages, and detail views all use it.
 * A detail page names its parent in `back`: a "‹ Parent" link top-left, above
 * the title (#576).
 */

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  /** Small line above the title (a station or section name). */
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons, segmented controls). */
  actions?: ReactNode;
  /** Optional row under the title (chips, breadcrumb, status). */
  meta?: ReactNode;
  /** A detail page's way back to its parent page, top-left above the title. */
  back?: BackLinkProps;
}

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { className, title, eyebrow, subtitle, actions, meta, back, ...rest },
  ref,
) {
  return (
    <header
      ref={ref}
      className={cn('flex flex-wrap items-start justify-between gap-3', className)}
      {...rest}
    >
      <div className="min-w-0">
        {back && (
          <div data-page-header-slot="back" className="mb-1">
            <BackLink {...back} />
          </div>
        )}
        {eyebrow}
        <h1 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink-strong">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
});
