import React, { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

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
 */

export interface KpiStripProps extends HTMLAttributes<HTMLDivElement> {
  /**
  * `auto` (default) fits as many 180px+ tiles as the container width
  * allows, and lets the final wrapped row expand evenly. A number forces
  * that fixed column count.
   */
  columns?: 'auto' | 2 | 3 | 4 | 5 | 6;
}

const COLUMN_CLASS: Record<Exclude<KpiStripProps['columns'], undefined | 'auto'>, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export const KpiStrip = forwardRef<HTMLDivElement, KpiStripProps>(function KpiStrip(
  { className, columns = 'auto', children, ...rest },
  ref
) {
  const modeClass = columns === 'auto'
    ? 'flex flex-wrap [&>*]:min-w-[180px] [&>*]:flex-[1_1_180px]'
    : cn('grid', COLUMN_CLASS[columns]);

  return (
    <div
      ref={ref}
      className={cn(
        'gap-px overflow-hidden rounded-card border border-border-soft bg-border-soft',
        modeClass,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
