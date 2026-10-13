import React, { useContext } from 'react';
import {
  canRecordDecantation,
  resolveDecantationSettings,
  type DecantationView,
  type Station,
} from '@pump/shared';
import { isoToLocalTime, toDecantationRow, useDecantations, formatQuantity } from '@pump/ui';
import { useDecantationNames } from '../../lib/decantation/names.js';
import { decantationRoute } from '../../lib/attention/routes.js';
import { ShellContext } from '../../shell/context.js';
import { TankerArrivedPage } from './TankerArrivedPage.js';
import { useNav } from '../../shell/nav.js';
import { DetailPage, ListGroup, ListRow, StateCard, StatusBadge } from '../../ui/index.js';
import { DecantationDetailPage } from './DecantationDetailPage.js';
import { FinishUnloadingPage } from './FinishUnloadingPage.js';

export const STATUS_BADGE = {
  DRAFT: { tone: 'warn', label: 'Unloading' },
  PENDING_MEASUREMENT: { tone: 'info', label: 'Pending measurement' },
  MEASURED: { tone: 'good', label: 'Measured' },
  DISCARDED: { tone: 'warn', label: 'Discarded' },
} as const;

/** Opens a visit: a draft goes to Finish unloading, the rest to a read-only detail. */
export function openDecantation(
  nav: ReturnType<typeof useNav>,
  station: Station,
  d: DecantationView,
) {
  nav.push(
    d.status === 'DRAFT' ? (
      <FinishUnloadingPage station={station} decantation={d} />
    ) : (
      <DecantationDetailPage station={station} decantationId={d.id} />
    ),
    decantationRoute(d.id),
  );
}

/** One row per tanker visit: status, flags, and which product still has no linked purchase. */
export const DecantationsListPage: React.FC<{ station: Station }> = ({ station }) => {
  const nav = useNav();
  const role = useContext(ShellContext)?.role;
  const q = useDecantations(station.id);
  const names = useDecantationNames(station.id);
  const tolerance = resolveDecantationSettings(station.settings).quantityTolerance;
  const tz = (station.settings as { timezone?: string } | undefined)?.timezone ?? 'Asia/Kolkata';
  const rows = (q.data ?? []).map((d) => toDecantationRow(d, names, tolerance));

  return (
    <DetailPage
      title="Decantations"
      subtitle={station.name}
      right={
        role && canRecordDecantation(role) ? (
          <button
            type="button"
            onClick={() => nav.push(<TankerArrivedPage station={station} />, 'tanker-arrived')}
            className="rounded-[10px] bg-accent-soft px-2.5 py-1 text-xs font-extrabold text-accent"
          >
            Tanker arrived
          </button>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <StateCard kind="loading">Loading…</StateCard>
      ) : q.isError ? (
        <StateCard kind="error" onRetry={() => void q.refetch()}>
          Could not load Decantations.
        </StateCard>
      ) : rows.length === 0 ? (
        <StateCard kind="empty">
          No Decantations yet. A tanker visit appears here once recorded.
        </StateCard>
      ) : (
        <ListGroup>
          {rows.map((r) => {
            const d = r.decantation;
            const badge = STATUS_BADGE[d.status];
            const meta = [
              r.tanks.map((t) => t.tankName).join(' + '),
              d.businessDate,
              isoToLocalTime(d.unloadStartedAt ?? d.createdAt, tz),
              r.receivedQty != null ? formatQuantity(r.receivedQty, 'L') : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <ListRow
                key={d.id}
                title={d.tankerNumber}
                meta={
                  <>
                    {meta}
                    {r.unlinked.length > 0 && (
                      <span className="block text-warn-fg">
                        Purchase not linked: {r.unlinked.join(', ')}
                      </span>
                    )}
                  </>
                }
                wrapMeta
                end={
                  <span className="flex flex-col items-end gap-1">
                    <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    {d.flags.length > 0 && (
                      <StatusBadge tone="bad">
                        {d.flags.length} flag{d.flags.length === 1 ? '' : 's'}
                      </StatusBadge>
                    )}
                  </span>
                }
                onPress={() => openDecantation(nav, station, d)}
              />
            );
          })}
        </ListGroup>
      )}
    </DetailPage>
  );
};
