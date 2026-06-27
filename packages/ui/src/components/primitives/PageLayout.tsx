import React from 'react';

export interface PageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Optional row shown under the header — filters, a summary strip, tabs. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Standard screen wrapper: a compact header (title + subtitle + primary/secondary
 * actions), an optional toolbar row, and the content area. Replaces the bespoke
 * header markup that every list screen re-implemented inline.
 */
export const PageLayout: React.FC<PageLayoutProps> = ({ title, subtitle, actions, toolbar, children }) => {
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', fontFamily: 'var(--font-sans)' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>{actions}</div>}
      </header>
      {toolbar && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>{toolbar}</div>}
      <div>{children}</div>
    </div>
  );
};
