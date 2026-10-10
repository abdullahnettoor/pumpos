import React from 'react';
import { HOME_ATTENTION_ID, useOpenAttention } from '../../shell/attention.js';
import { useNav } from '../../shell/nav.js';
import { SectionLabel } from '../../ui/index.js';
import { ChevronRightIcon } from '../../ui/icons.js';
import type { MobileAlert } from '../../lib/alerts.js';

/** Alerts shown on Home; the rest are behind "All N". */
export const HOME_ALERT_LIMIT = 2;

interface Props {
  /** Already sorted by severity (`useMobileAlerts`). */
  alerts: readonly MobileAlert[];
}

const TONE = {
  danger: { row: 'border-bad-line bg-bad-soft', dot: 'bg-bad', text: 'text-bad-fg' },
  warning: { row: 'border-warn-line bg-warn-soft', dot: 'bg-warn', text: 'text-warn-fg' },
  info: { row: 'border-line bg-card-alt', dot: 'bg-text-faint', text: 'text-text-muted' },
} as const;

/**
 * The top alerts by severity. The section is also the header bell's target
 * (`HOME_ATTENTION_ID`, shell/attention.ts): it stays on screen when there is
 * nothing to report so the bell always has somewhere to land. "All N" goes
 * through `useOpenAttention`, which the Needs attention page will take over.
 */
export const HomeAttention: React.FC<Props> = ({ alerts }) => {
  const nav = useNav();
  const openAll = useOpenAttention();
  const top = alerts.slice(0, HOME_ALERT_LIMIT);

  return (
    <section
      id={HOME_ATTENTION_ID}
      tabIndex={-1}
      aria-label="Needs attention"
      className="scroll-mt-2 outline-none"
    >
      <SectionLabel
        right={
          alerts.length > 0 ? (
            <button type="button" onClick={openAll} aria-label={`All ${alerts.length} alerts`}>
              All {alerts.length} ›
            </button>
          ) : undefined
        }
      >
        Attention
      </SectionLabel>
      {top.length === 0 ? (
        <p className="mx-3 rounded-[14px] border border-good-line bg-good-soft px-3 py-2.5 text-xs font-medium text-good">
          Nothing needs attention
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {top.map((a) => {
            const tone = TONE[a.severity];
            const target = a.tab && nav.tabs.includes(a.tab) ? a.tab : null;
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${tone.dot}`}
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-semibold text-text-high">
                    {a.title}
                  </span>
                  {a.meta && (
                    <span className="block truncate text-[11px] text-text-muted">{a.meta}</span>
                  )}
                </span>
                {target && (
                  <span className={`flex-shrink-0 ${tone.text}`}>
                    <ChevronRightIcon size={16} strokeWidth={2.2} />
                  </span>
                )}
              </>
            );
            const cls = `mx-3 flex items-center gap-2.5 rounded-[14px] border px-3 py-[11px] ${tone.row}`;
            return target ? (
              <button key={a.id} type="button" onClick={() => nav.select(target)} className={cls}>
                {body}
              </button>
            ) : (
              <div key={a.id} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
