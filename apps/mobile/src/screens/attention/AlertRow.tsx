import React from 'react';
import { ALERT_KINDS } from '../../lib/attention/groups.js';
import type { MobileAlert } from '../../lib/alerts.js';
import { ChevronRightIcon } from '../../ui/icons.js';

const TONE = {
  danger: { row: 'border-bad-line bg-bad-soft', dot: 'bg-bad', text: 'text-bad-fg' },
  warning: { row: 'border-warn-line bg-warn-soft', dot: 'bg-warn', text: 'text-warn-fg' },
  info: { row: 'border-line bg-card-alt', dot: 'bg-text-faint', text: 'text-text-muted' },
} as const;

interface Props {
  alert: MobileAlert;
  /** Opens the page the alert explains; null renders a plain, non-tappable row. */
  onOpen: (() => void) | null;
  /** Show the action word ("View", "Continue") beside the chevron. */
  showAction?: boolean;
}

/**
 * One alert: severity dot, title, meta, and when it opens a page, a chevron
 * (with the action word on the Needs attention page). Shared by Home's top two
 * and the page, so a row reads and behaves the same in both.
 */
export const AlertRow: React.FC<Props> = ({ alert, onOpen, showAction = false }) => {
  const tone = TONE[alert.severity];
  const word = showAction ? ALERT_KINDS[alert.category].actionLabel : undefined;
  const body = (
    <>
      <span aria-hidden="true" className={`h-2 w-2 flex-shrink-0 rounded-full ${tone.dot}`} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-semibold text-text-high">
          {alert.title}
        </span>
        {alert.meta && (
          <span className="block truncate text-[11px] text-text-muted">{alert.meta}</span>
        )}
      </span>
      {onOpen && (
        <span className={`flex flex-shrink-0 items-center gap-0.5 text-xs font-bold ${tone.text}`}>
          {word}
          <ChevronRightIcon size={16} strokeWidth={2.2} />
        </span>
      )}
    </>
  );
  const cls = `mx-3 flex items-center gap-2.5 rounded-[14px] border px-3 py-[11px] ${tone.row}`;
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${cls} w-[calc(100%-1.5rem)]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};
