import React from 'react';

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}

const toneColor: Record<NonNullable<KpiProps['tone']>, string> = {
  default: 'var(--text-high)',
  positive: 'var(--good)',
  negative: 'var(--bad-fg)',
  warning: 'var(--warn-fg)',
};

export const Kpi: React.FC<KpiProps> = ({ label, value, sub, tone = 'default' }) => (
  <div
    className="rounded-xl border p-4"
    style={{
      backgroundColor: 'var(--bg-surface)',
      borderColor: 'var(--border-soft)',
    }}
  >
    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
      {label}
    </p>
    <p
      className="mt-1 font-mono text-xl font-semibold tabular-nums"
      style={{ color: toneColor[tone] }}
    >
      {value}
    </p>
    {sub && (
      <p className="mt-0.5 text-xs" style={{ color: 'var(--text-faint)' }}>
        {sub}
      </p>
    )}
  </div>
);
