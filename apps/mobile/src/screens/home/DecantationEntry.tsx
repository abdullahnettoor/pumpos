import React, { useContext } from 'react';
import { canRecordDecantation, type Station } from '@pump/shared';
import { isoToLocalTime, useDecantations } from '@pump/ui';
import { useDecantationNames } from '../../lib/decantation/names.js';
import { ShellContext, useStationTimeZone } from '../../shell/context.js';
import { useNav } from '../../shell/nav.js';
import { ChevronRightIcon } from '../../ui/icons.js';
import { DecantationsListPage, openDecantation } from '../decantation/DecantationsListPage.js';
import { TankerArrivedPage } from '../decantation/TankerArrivedPage.js';

/** Owner, Manager and Accountant record tanker visits; Attendants never see these. */
export function useCanRecordDecantation(): boolean {
  const role = useContext(ShellContext)?.role;
  return !!role && canRecordDecantation(role);
}

/** "Tanker arrived" and "Decantations ›", the Tanks section's actions. */
export const DecantationActions: React.FC<{ station: Station }> = ({ station }) => {
  const nav = useNav();
  if (!useCanRecordDecantation()) return null;
  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => nav.push(<TankerArrivedPage station={station} />, 'tanker-arrived')}
        className="rounded-[10px] bg-accent-soft px-2.5 py-1 text-[12px] font-extrabold text-accent"
      >
        Tanker arrived
      </button>
      <button
        type="button"
        onClick={() => nav.push(<DecantationsListPage station={station} />, 'decantations')}
      >
        Decantations ›
      </button>
    </span>
  );
};

/** Pinned while a tanker is still unloading (a DRAFT Decantation), like the handover card. */
export const DecantationCard: React.FC<{ station: Station }> = ({ station }) => {
  const nav = useNav();
  const allowed = useCanRecordDecantation();
  const tz = useStationTimeZone();
  const q = useDecantations(station.id, 'DRAFT', { enabled: allowed });
  const names = useDecantationNames(station.id);
  if (!allowed) return null;
  const drafts = (q.data ?? []).filter((d) => d.status === 'DRAFT');
  if (drafts.length === 0) return null;

  return (
    <>
      {drafts.map((d) => {
        const tanks = [...new Set(d.lines.map((l) => names.tanks[l.tankId]).filter(Boolean))].join(
          ' + ',
        );
        const arrived = isoToLocalTime(d.unloadStartedAt ?? d.createdAt, tz);
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => openDecantation(nav, station, d)}
            className="mx-3 mb-2.5 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl bg-accent px-3.5 py-3 text-left text-on-accent"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold">
                {[d.tankerNumber, tanks, `arrived ${arrived}`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-1 rounded-[10px] bg-[color-mix(in_srgb,var(--on-accent)_14%,transparent)] px-2.5 py-[7px] text-xs font-extrabold">
              Finish unloading
              <ChevronRightIcon size={14} strokeWidth={2.6} />
            </span>
          </button>
        );
      })}
    </>
  );
};
