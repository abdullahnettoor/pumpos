import React, { useState } from 'react';
import { AlertTriangle, Info, CheckCircle, X } from 'lucide-react';
import { Button } from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';

export type BannerSeverity = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<BannerSeverity, string> = {
  info: 'bg-info-bg text-info-fg border-info-fg',
  success: 'bg-success-bg text-success-fg border-success-fg',
  warning: 'bg-warning-bg text-warning-fg border-warning-fg',
  danger: 'bg-danger-bg text-danger-fg border-danger-fg',
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
  /** Secondary action buttons (e.g. ghost, sm), rendered before the primary action. */
  actions?: React.ReactNode;
  /**
   * When true, renders a dismiss (×) button and hides itself on click. Omit for
   * a persistent banner that stays until its underlying condition clears (e.g.
   * low stock, offline). Use `onDismiss` to persist the dismissal if needed.
   */
  dismissible?: boolean;
  onDismiss?: () => void;
  /**
   * Accessible name for the dismiss control. Defaults to "Dismiss".
   *
   * Override it where dismissing means something more specific than "hide
   * this" — the desktop update notice uses "Not now", because putting an
   * offered update away is a different act from discarding a stale message,
   * and a screen-reader user hearing "Dismiss" for both cannot tell them
   * apart.
   */
  dismissLabel?: string;
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
  actions,
  dismissible = false,
  onDismiss,
  dismissLabel = 'Dismiss',
  icon,
  style,
}) => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const showIcon = icon !== null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-between gap-3 rounded-input border px-3.5 py-2.5 text-[13px] font-medium',
        TONE[severity],
      )}
      style={style}
    >
      <span className="flex min-w-0 items-center gap-2">
        {showIcon && <span className="inline-flex shrink-0">{icon ?? DEFAULT_ICON[severity]}</span>}
        <span className="min-w-0 break-words">
          {title && <strong className={children ? 'mr-1.5' : undefined}>{title}</strong>}
          {children}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {actions}
        {actionLabel && onAction && (
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
        {dismissible && (
          <button
            type="button"
            aria-label={dismissLabel}
            onClick={() => {
              setDismissed(true);
              onDismiss?.();
            }}
            className="inline-flex cursor-pointer border-0 bg-transparent p-0.5 text-inherit"
          >
            <X size={15} />
          </button>
        )}
      </span>
    </div>
  );
};
