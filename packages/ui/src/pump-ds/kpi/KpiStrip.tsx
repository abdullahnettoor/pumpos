import React, { Children, forwardRef, isValidElement, useEffect, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { formatKpiScope, type KpiScope } from './scope.js';
import { KpiStripScopeProvider } from './context.js';

/**
 * KpiStrip — a compact, wrap-friendly row of `KpiTile`s. Uses the
 * "gap-as-divider" technique: the container paints `--border-soft` as its
 * background and each child tile paints `--bg-surface`, so the 1px `gap`
 * renders as clean dividers on both axes automatically. When the strip
 * wraps to a second row, the new row's tiles get proper top dividers with
 * no `:nth-last-of-row` gymnastics.
 *
 * Columns default to flex-wrap with a 180px minimum; pass an explicit
 * `columns` count when the surface needs a fixed grid (e.g. a 4-up
 * dashboard header). Container radius, border, and overflow-clip are baked
 * in so KpiTile can stay featureless.
 *
 * At most 4 tiles (#567): more logs a dev warning. A fifth figure belongs in
 * the table, or the strip is repeating it.
 *
 * `scope` (#604): when every tile covers the same period, the strip names it
 * once in a caption above the tiles, and a tile's matching chip is dropped.
 * Leave it unset on a mixed strip (balances beside a month, Today beside Oct):
 * there each period tile keeps its own chip and a balance shows none.
 */

export const MAX_KPI_TILES = 4;

export interface KpiStripProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `auto` (default) fits as many 180px+ tiles as the container width
   * allows, and lets the final wrapped row expand evenly. A number forces
   * that fixed column count.
   */
  columns?: 'auto' | 2 | 3 | 4 | 5 | 6;
  /** The one period every tile covers, named once above the strip (#604). */
  scope?: KpiScope;
}

const COLUMN_CLASS: Record<Exclude<KpiStripProps['columns'], undefined | 'auto'>, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export const KpiStrip = forwardRef<HTMLDivElement, KpiStripProps>(function KpiStrip(
  { className, columns = 'auto', scope, children, ...rest },
  ref,
) {
  const tiles = Children.toArray(children).filter(isValidElement).length;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || tiles <= MAX_KPI_TILES) return;
    console.warn(
      `[KpiStrip] ${tiles} tiles in one strip; the limit is ${MAX_KPI_TILES}. ` +
        'Drop a tile or move the figure into the table.',
    );
  }, [tiles]);

  const modeClass =
    columns === 'auto'
      ? 'flex flex-wrap [&>*]:min-w-[180px] [&>*]:flex-[1_1_180px]'
      : cn('grid', COLUMN_CLASS[columns]);

  const frame = cn(
    'gap-px overflow-hidden rounded-card border border-border-soft bg-border-soft',
    modeClass,
  );

  if (!scope) {
    return (
      <div ref={ref} className={cn(frame, className)} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-kpi-strip-scope=""
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
      {...rest}
    >
      <div className="px-0.5 text-[12px] font-medium text-ink-muted">{formatKpiScope(scope)}</div>
      <div className={frame}>
        <KpiStripScopeProvider value={scope}>{children}</KpiStripScopeProvider>
      </div>
    </div>
  );
});
