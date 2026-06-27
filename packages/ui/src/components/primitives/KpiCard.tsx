import React from 'react';

export type KpiTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

const TONE_FG: Record<KpiTone, string> = {
  default: 'var(--text-strong)',
  success: 'var(--state-success-fg)',
  warning: 'var(--state-warning-fg)',
  danger: 'var(--state-danger-fg)',
  info: 'var(--state-info-fg)',
};

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: KpiTone;
  /** Render the value with the monospace data font (numbers/currency). */
  mono?: boolean;
}

/**
 * Compact metric tile for dashboards and summary strips. Numbers use the data
 * (monospace) font per the design system.
 */
export const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, tone = 'default', mono = true }) => {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: '22px', fontWeight: 700, color: TONE_FG[tone], fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)' }}>
        {value}
      </span>
      {sub != null && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
};
