import React from 'react';

export interface StatusBadgeProps {
  status: string;
  type?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  children?: React.ReactNode;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type = 'default',
  children,
}) => {
  const getBadgeStyle = () => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: 'var(--state-success-bg)',
          color: 'var(--state-success-fg)',
          border: '1px solid rgba(30, 106, 78, 0.15)',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--state-warning-bg)',
          color: 'var(--state-warning-fg)',
          border: '1px solid rgba(138, 97, 22, 0.15)',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--state-danger-bg)',
          color: 'var(--state-danger-fg)',
          border: '1px solid rgba(159, 63, 54, 0.15)',
        };
      case 'info':
        return {
          backgroundColor: 'var(--state-info-bg)',
          color: 'var(--state-info-fg)',
          border: '1px solid rgba(46, 94, 136, 0.15)',
        };
      case 'default':
      default:
        return {
          backgroundColor: 'var(--bg-surface-alt)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-soft)',
        };
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 600,
        borderRadius: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontFamily: 'var(--font-mono)',
        ...getBadgeStyle(),
      }}
    >
      {children || status}
    </span>
  );
};
