import React, { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

/**
 * Skeleton — a quiet pulsing block that holds the place of content still
 * loading. Size it like the real content (pass `height`) so nothing shifts
 * when the data lands. The pulse stops under `prefers-reduced-motion`.
 *
 * Give it an `aria-label` ("Loading sales") when it stands for a whole
 * section; it is marked `aria-busy`.
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
      aria-busy="true"
      className={cn('rounded-input bg-surface-alt motion-safe:animate-pulse', className)}
      style={{ height, width, ...style }}
      {...rest}
    />
  );
});
