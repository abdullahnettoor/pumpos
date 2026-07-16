import React from 'react';

/**
 * Lightweight shimmer skeletons for partial/lazy loading — render the page shell
 * immediately and show these in place of individual cards/rows while their data
 * loads, instead of blocking the whole screen on one query.
 */
export const Skeleton: React.FC<{ width?: string | number; height?: string | number; radius?: string; style?: React.CSSProperties }>
  = ({ width = '100%', height = 14, radius = '6px', style }) => (
  <div className="pump-skeleton" style={{ width, height, borderRadius: radius, ...style }} />
);

export const SkeletonCard: React.FC<{ lines?: number; minHeight?: number }> = ({ lines = 3, minHeight = 180 }) => (
  <div className="card card-default" style={{ minHeight, display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <Skeleton width="40%" height={11} />
    <Skeleton width="70%" height={22} />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} width={`${90 - i * 12}%`} height={12} />
    ))}
  </div>
);

export const SkeletonGrid: React.FC<{ count?: number; minWidth?: number }> = ({ count = 3, minWidth = 320 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: '20px' }}>
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);
