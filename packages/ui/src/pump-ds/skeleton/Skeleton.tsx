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
