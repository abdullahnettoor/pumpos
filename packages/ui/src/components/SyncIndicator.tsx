import React from 'react';

export interface SyncIndicatorProps {
  status: 'online' | 'offline' | 'synced' | 'pending' | 'failed';
  pendingCount?: number;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({
  status,
  pendingCount = 0,
}) => {
  const getIndicatorProps = () => {
    switch (status) {
      case 'synced':
        return {
          color: 'var(--state-success-fg)',
          bg: 'var(--state-success-bg)',
          text: 'Synced',
        };
      case 'pending':
        return {
          color: 'var(--state-warning-fg)',
          bg: 'var(--state-warning-bg)',
          text: pendingCount > 0 ? `Syncing (${pendingCount} pending)` : 'Syncing...',
        };
      case 'failed':
        return {
          color: 'var(--state-danger-fg)',
          bg: 'var(--state-danger-bg)',
          text: 'Sync Failed',
        };
      case 'offline':
        return {
          color: 'var(--text-muted)',
          bg: 'var(--bg-surface-alt)',
          text: 'Offline Mode',
        };
      case 'online':
      default:
        return {
          color: 'var(--state-info-fg)',
          bg: 'var(--state-info-bg)',
          text: 'Connected',
        };
    }
  };

  const props = getIndicatorProps();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        color: props.color,
        backgroundColor: props.bg,
        padding: '4px 10px',
        borderRadius: 'var(--radius-chip)',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        border: '1px solid currentColor',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: props.color,
        }}
      />
      <span>{props.text}</span>
    </div>
  );
};
