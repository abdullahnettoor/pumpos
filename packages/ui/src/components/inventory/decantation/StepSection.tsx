import React from 'react';
import { Icon } from '../../../pump-ds/index.js';

export interface StepSectionProps {
  n: number;
  title: string;
  open: boolean;
  done: boolean;
  /** Compact card of the recorded values, shown once the step is finished and collapsed. */
  summary: React.ReactNode;
  onOpen: () => void;
  children: React.ReactNode;
}

/**
 * One step of the Decantation stepper (accordion). A finished step collapses into a
 * compact card of its recorded values; clicking the header opens it again to edit.
 */
export const StepSection: React.FC<StepSectionProps> = ({
  n,
  title,
  open,
  done,
  summary,
  onOpen,
  children,
}) => (
  <section
    aria-label={title}
    style={{
      border: `1px solid ${open ? 'var(--brand-primary)' : 'var(--border-soft)'}`,
      borderRadius: 'var(--radius-input, 8px)',
      marginBottom: 10,
      overflow: 'hidden',
      background: 'var(--bg-surface)',
    }}
  >
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: open ? 'var(--bg-surface-alt)' : 'transparent',
        border: 0,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--text-strong)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 600,
          background:
            done && !open
              ? 'var(--state-success-bg)'
              : open
                ? 'var(--brand-primary)'
                : 'var(--bg-surface-alt)',
          color:
            done && !open
              ? 'var(--state-success-fg)'
              : open
                ? 'var(--text-on-brand, #fff)'
                : 'var(--text-muted)',
        }}
      >
        {done && !open ? <Icon name="check" size="xs" /> : n}
      </span>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
      <span style={{ flex: 1 }} />
      {done && !open && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Edit</span>}
    </button>
    {open ? (
      <div style={{ padding: '4px 12px 12px' }}>{children}</div>
    ) : done ? (
      <div
        style={{
          padding: '2px 12px 10px 44px',
          cursor: 'pointer',
        }}
        onClick={onOpen}
      >
        {summary}
      </div>
    ) : null}
  </section>
);

/** Compact label/value pairs for the finished-step cards. */
export const KV: React.FC<{ items: [string, React.ReactNode][] }> = ({ items }) => (
  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
    {items.map(([k, v]) => (
      <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '.04em',
            color: 'var(--text-muted)',
          }}
        >
          {k}
        </span>
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      </div>
    ))}
  </div>
);

export const LINE_COLORS = ['#2563eb', '#c2410c', '#7c3aed', '#0f766e'];

export const LineTag: React.FC<{ i: number; label: string }> = ({ i, label }) => (
  <span
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}
  >
    <span
      aria-hidden="true"
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        background: LINE_COLORS[i % LINE_COLORS.length],
      }}
    />
    {label}
  </span>
);

export const Notice: React.FC<{
  tone: 'danger' | 'info' | 'warning';
  children: React.ReactNode;
}> = ({ tone, children }) => (
  <div
    role="note"
    style={{
      background: `var(--state-${tone}-bg)`,
      color: `var(--state-${tone}-fg)`,
      padding: '6px 10px',
      borderRadius: 'var(--radius-input, 6px)',
      fontSize: 12,
      margin: '6px 0',
    }}
  >
    {children}
  </div>
);
