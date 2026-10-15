import React, { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

/**
 * Skeleton — a quiet pulsing block that holds the place of content still
 * loading. Size it like the real content (pass `height`) so nothing shifts
 * when the data lands. The pulse stops under `prefers-reduced-motion`.
 *
 * It is a `role="status"` region; give it an `aria-label` ("Loading sales")
 * when it stands for a whole section. Decorative lines inside a larger
 * placeholder pass `role="presentation"` and `aria-hidden`.
 */
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Block height in px (or any CSS length). */
  height?: number | string;
  /** Block width; defaults to the full row. */
  width?: number | string;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, height = 14, width, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="status"
      className={cn('rounded-input bg-surface-alt motion-safe:animate-pulse', className)}
      style={{ height, width, ...style }}
      {...rest}
    />
  );
});

/** One placeholder card: a label line, a figure line, then `lines` text lines. */
const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="flex min-h-[180px] flex-col gap-3 rounded-card border border-border-soft bg-surface p-5">
    <Skeleton role="presentation" aria-hidden width="40%" height={11} />
    <Skeleton role="presentation" aria-hidden width="70%" height={22} />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} role="presentation" aria-hidden width={`${90 - i * 12}%`} height={12} />
    ))}
  </div>
);

export interface SkeletonGridProps {
  /** How many placeholder cards. */
  count?: number;
}

/**
 * A grid of placeholder cards for a whole page whose shape is not known yet
 * (the shell is drawn, the station list is still arriving). A section that
 * loads its own data uses a `DataSection` instead.
 */
export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 3 }) => (
  <div aria-busy="true" className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
