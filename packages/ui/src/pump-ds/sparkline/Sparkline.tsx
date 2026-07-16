import React, { useId } from 'react';
import type { DotTone } from '../dot/Dot.js';

/**
 * Sparkline — a compact, dependency-free trend line rendered as inline SVG.
 * For dashboard "last N days" micro-trends. Optional area fill under the line.
 * Tone maps to the stroke color via the theme bridge.
 *
 * Deliberately no axes/tooltips — reach for a chart lib only when a real
 * analytics surface needs them.
 */

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: DotTone;
  /** Draw a soft area fill beneath the line. */
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
}

const STROKE: Record<DotTone, string> = {
  brand: 'var(--color-brand)',
  info: 'var(--color-info-fg)',
  success: 'var(--color-success-fg)',
  warning: 'var(--color-warning-fg)',
  danger: 'var(--color-danger-fg)',
  neutral: 'var(--color-ink-faint)',
};

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 96,
  height = 28,
  tone = 'brand',
  fill = false,
  strokeWidth = 1.5,
  className,
  'aria-label': ariaLabel,
}) => {
  const gradId = useId();
  if (!data || data.length === 0) {
    return <svg width={width} height={height} className={className} role="img" aria-label={ariaLabel} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = strokeWidth + 0.5;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(2)},${(height - pad).toFixed(2)} L${points[0][0].toFixed(2)},${(height - pad).toFixed(2)} Z`;
  const color = STROKE[tone];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} stroke="none" />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
