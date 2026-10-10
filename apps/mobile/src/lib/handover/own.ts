import type { MyAssignment } from '../../components/handover/model.js';
import { formatRecordedTime, buildRecap } from './recap.js';
import { plural } from '../format.js';
import { varianceBadge } from '../variance.js';

/**
 * The signed-in user's own Handover as the server knows it, for the pinned Home
 * card, the handover page header and the bell. Pure.
 *
 * Only what `my-assignment` holds is reported: a Handover is "saved" when the
 * server stored it for every Dispenser Unit the user is accountable for, and
 * the slips counted are the ones already recorded. What the user has typed but
 * not saved is never known here, so it is never claimed as progress.
 */
export interface OwnHandover {
  /** "Your handover · DU2". */
  title: string;
  duLabel: string;
  shiftName: string | null;
  stationName: string | null;
  openedAt: string | null;
  /** Every Dispenser Unit has a stored Handover. */
  saved: boolean;
  /** "Not saved yet · 2 credit slips" / "Saved 5:40 pm · Balanced" / "Saved 5:40 pm · −₹340". */
  status: string;
}

/** Null when the user has no Dispenser Unit on an open Shift. */
export function deriveOwnHandover(assignment: MyAssignment | null | undefined): OwnHandover | null {
  const dus = assignment?.dispenserUnits ?? [];
  if (!assignment || dus.length === 0) return null;

  const duLabel = dus.map((du) => du.duName).join(', ');
  const savedCount = dus.filter((du) => du.handover).length;
  const recap = buildRecap({ dus, merchandise: undefined });

  let status: string;
  if (recap) {
    const time = formatRecordedTime(recap.recordedAt);
    status = ['Saved' + (time ? ` ${time}` : ''), varianceBadge(recap.variance).text].join(' · ');
  } else if (savedCount > 0) {
    status = `${savedCount} of ${dus.length} DUs saved`;
  } else {
    // Credit slips only: an OMC card sale settles into the OMC Wallet, it is not a credit slip.
    const slips = dus.reduce((n, du) => n + (du.creditSales?.length ?? 0), 0);
    status = slips > 0 ? `Not saved yet · ${plural(slips, 'credit slip')}` : 'Not saved yet';
  }

  return {
    title: `Your handover · ${duLabel}`,
    duLabel,
    shiftName: assignment.shift?.templateName ?? null,
    stationName: assignment.station?.name ?? null,
    openedAt: assignment.shift?.openedAt ?? null,
    saved: recap !== null,
    status,
  };
}
