import React from 'react';
import { useOwnHandover } from '../../lib/handover/useOwnHandover.js';
import { useStationTimeZone } from '../../shell/context.js';
import { useNav } from '../../shell/nav.js';
import { HandoverIcon, ChevronRightIcon } from '../../ui/icons.js';
import { HandoverPage } from '../HandoverPage.js';

/**
 * "Your handover · DU2": pinned to the top of Home for a user assigned to a
 * Dispenser Unit on the open Shift, and absent for everyone else (it goes when
 * the Shift closes, because the assignment does). The status is only what the
 * server knows: saved or not, the variance, the credit slips recorded so far.
 * It opens the handover as a detail page.
 */
export const HandoverCard: React.FC = () => {
  const nav = useNav();
  const own = useOwnHandover(true, useStationTimeZone());
  if (!own) return null;

  const meta = [own.shiftName, own.status].filter(Boolean).join(' · ');
  const tone = own.saved
    ? 'border border-good-line bg-good-soft text-text-high'
    : 'bg-accent text-on-accent';
  const chip = own.saved
    ? 'bg-good text-on-accent'
    : 'bg-[color-mix(in_srgb,var(--on-accent)_14%,transparent)]';

  return (
    <button
      type="button"
      onClick={() => nav.push(<HandoverPage />, 'handover')}
      className={`mx-3 mb-2.5 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl px-3.5 py-3 text-left ${tone}`}
    >
      <span
        aria-hidden="true"
        className={`grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] ${chip}`}
      >
        <HandoverIcon size={18} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold">{own.title}</span>
        <span
          className={`block text-[11.5px] font-semibold leading-snug ${own.saved ? 'text-text-muted' : 'opacity-80'}`}
        >
          {meta}
        </span>
      </span>
      <span
        className={`flex flex-shrink-0 items-center gap-1 rounded-[10px] px-2.5 py-[7px] text-xs font-extrabold ${chip}`}
      >
        {own.saved ? 'Edit' : 'Continue'}
        <ChevronRightIcon size={14} strokeWidth={2.6} />
      </span>
    </button>
  );
};
