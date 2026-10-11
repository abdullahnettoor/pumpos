import type React from 'react';
import { formatQty } from '../../../utils/format.js';

export const th: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
};
export const thR: React.CSSProperties = { ...th, textAlign: 'right' };
export const td: React.CSSProperties = {
  padding: '10px 10px',
  color: 'var(--text-default)',
  fontSize: '12px',
  borderBottom: '1px solid var(--border-subtle)',
};
export const tdR: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
};
export const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '11px' };

/** "+1.50 L" / "-2.00 L"; null-preserving: a missing number is a dash, never 0. */
export function signedLitres(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v > 0 ? '+' : ''}${formatQty(v, 2)} L`;
}

export function litres(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${formatQty(v, 2)} L`;
}

export function varianceColor(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return 'var(--text-muted)';
  return v < 0 ? 'var(--state-danger-fg)' : 'var(--state-success-fg)';
}
