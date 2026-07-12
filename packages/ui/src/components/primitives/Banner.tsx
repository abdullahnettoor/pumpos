import React, { useState } from 'react';
import { AlertTriangle, Info, CheckCircle, X } from 'lucide-react';
import { Button } from '../../pump-ds/index.js';

export type BannerSeverity = 'info' | 'success' | 'warning' | 'danger';

const STYLE: Record<BannerSeverity, { bg: string; fg: string }> = {
  info: { bg: 'var(--state-info-bg)', fg: 'var(--state-info-fg)' },
  success: { bg: 'var(--state-success-bg)', fg: 'var(--state-success-fg)' },
  warning: { bg: 'var(--state-warning-bg)', fg: 'var(--state-warning-fg)' },
  danger: { bg: 'var(--state-danger-bg)', fg: 'var(--state-danger-fg)' },
};

const DEFAULT_ICON: Record<BannerSeverity, React.ReactNode> = {
  info: <Info size={15} />,
  success: <CheckCircle size={15} />,
  warning: <AlertTriangle size={15} />,
  danger: <AlertTriangle size={15} />,
};

export interface BannerProps {
  severity?: BannerSeverity;
  /** Optional bold lead-in shown before the message. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Inline action button (e.g. "View Stock"). */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * When true, renders a dismiss (×) button and hides itself on click. Omit for
   * a persistent banner that stays until its underlying condition clears (e.g.
   * low stock, offline). Use `onDismiss` to persist the dismissal if needed.
   */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Override the default severity icon. Pass null to hide it. */
  icon?: React.ReactNode | null;
  style?: React.CSSProperties;
}

/**
 * Inline status banner for page/section-level messages — the persistent
 * counterpart to a transient toast. Use for conditions the user should keep
 * seeing until resolved (low stock, offline, unclosed day) or dismissible
 * notices. Severity maps to the design-system state colours.
 */
export const Banner: React.FC<BannerProps> = ({
  severity = 'info',
  title,
  children,
  actionLabel,
  onAction,
  dismissible = false,
  onDismiss,
  icon,
  style,
}) => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { bg, fg } = STYLE[severity];
  const showIcon = icon !== null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 14px',
        borderRadius: 'var(--radius-input)',
        fontSize: '13px',
        fontWeight: 500,
        backgroundColor: bg,
        color: fg,
        border: `1px solid ${fg}`,
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {showIcon && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{icon ?? DEFAULT_ICON[severity]}</span>}
        <span>
          {title && <strong style={{ marginRight: '6px' }}>{title}</strong>}
          {children}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {actionLabel && onAction && (
          <Button variant="secondary" size="sm" onClick={onAction}>{actionLabel}</Button>
        )}
        {dismissible && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => { setDismissed(true); onDismiss?.(); }}
            style={{ display: 'inline-flex', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}
          >
            <X size={15} />
          </button>
        )}
      </span>
    </div>
  );
};
