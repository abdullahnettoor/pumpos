import React from 'react';
import { HOME_ATTENTION_ID, useOpenAttention } from '../../shell/attention.js';
import { SectionLabel } from '../../ui/index.js';
import type { Station } from '@pump/shared';
import type { MobileAlert } from '../../lib/alerts.js';
import { AlertRow } from '../attention/AlertRow.js';
import { useAlertOpener } from '../attention/useAlertOpener.js';

/** Alerts shown on Home; the rest are behind "All N". */
export const HOME_ALERT_LIMIT = 2;

interface Props {
  /** Already sorted by severity (`useMobileAlerts`). */
  alerts: readonly MobileAlert[];
  /** The pages an alert opens belong to this station. */
  station: Station | null;
}

/**
 * The top alerts by severity, with "All N ›" to the Needs attention page (the
 * same page the header bell opens, the same count). A row opens the page that
 * explains it; stock rows have none. The section stays on screen when there is
 * nothing to report.
 */
export const HomeAttention: React.FC<Props> = ({ alerts, station }) => {
  const openAll = useOpenAttention();
  const open = useAlertOpener(station);
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
          {top.map((a) => (
            <AlertRow key={a.id} alert={a} onOpen={open(a)} />
          ))}
        </div>
      )}
    </section>
  );
};
