import React from 'react';
import { useMobileAlerts } from '../lib/alerts.js';
import { groupAlerts } from '../lib/attention/groups.js';
import { plural } from '../lib/format.js';
import { useShell } from '../shell/context.js';
import { DetailPage, SectionLabel } from '../ui/index.js';
import { AlertRow } from './attention/AlertRow.js';
import { useAlertOpener } from './attention/useAlertOpener.js';

/**
 * The full alert inbox behind the header bell. It reads the same list as the
 * bell badge and Home's "All N" (`useMobileAlerts`), grouped by kind (stock,
 * day close, credit, cash variance, handover). Each alert opens the one page
 * that explains it, when the Role may see that page; stock has none. Open
 * alerts only: there is no resolved history.
 *
 *   nav.push(<NeedsAttentionPage />, 'attention')
 */
export const NeedsAttentionPage: React.FC = () => {
  const { station } = useShell();
  const alerts = useMobileAlerts(station);
  const open = useAlertOpener(station);
  const groups = groupAlerts(alerts);

  return (
    <DetailPage
      title="Needs attention"
      subtitle={alerts.length ? `${alerts.length} open` : undefined}
    >
      {groups.length === 0 ? (
        <p className="mx-3 mt-4 rounded-[14px] border border-good-line bg-good-soft px-3 py-2.5 text-xs font-medium text-good">
          Nothing needs attention
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.category} aria-label={`${g.label}, ${plural(g.alerts.length, 'alert')}`}>
            <SectionLabel>{g.label}</SectionLabel>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {g.alerts.map((a) => (
                <li key={a.id}>
                  <AlertRow alert={a} onOpen={open(a)} showAction />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </DetailPage>
  );
};
