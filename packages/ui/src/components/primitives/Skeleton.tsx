import React from 'react';
import { Skeleton as DsSkeleton } from '../../pump-ds/skeleton/index.js';

/**
 * @deprecated Use the pump-ds `Skeleton` (`pump-ds/skeleton`), or a
 * `DataSection` for a region that loads its own data. This wrapper only keeps
 * the old `width` / `height` / `radius` / `style` API working for existing
 * callers; #539 deletes it.
 */
export const Skeleton: React.FC<{
  width?: string | number;
  height?: string | number;
  radius?: string;
  style?: React.CSSProperties;
}> = ({ width = '100%', height = 14, radius, style }) => (
  <DsSkeleton
    role="presentation"
    aria-hidden
    width={width}
    height={height}
    style={radius ? { borderRadius: radius, ...style } : style}
  />
);

/** @deprecated See `Skeleton`; #539 deletes it. */
export const SkeletonCard: React.FC<{ lines?: number; minHeight?: number }> = ({
  lines = 3,
  minHeight = 180,
}) => (
  <div
    className="card card-default"
    style={{ minHeight, display: 'flex', flexDirection: 'column', gap: '12px' }}
  >
    <Skeleton width="40%" height={11} />
    <Skeleton width="70%" height={22} />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} width={`${90 - i * 12}%`} height={12} />
    ))}
  </div>
);

/** @deprecated See `Skeleton`; #539 deletes it. */
export const SkeletonGrid: React.FC<{ count?: number; minWidth?: number }> = ({
  count = 3,
  minWidth = 320,
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
      gap: '20px',
    }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
