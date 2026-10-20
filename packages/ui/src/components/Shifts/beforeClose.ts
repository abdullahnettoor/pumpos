import { VARIANCE_FLAG_RUPEES, type DrawerFigures } from './drawerFigures.js';
import type { NozzleGroup } from './nozzleFigures.js';

// ── Before close ────────────────────────────────────────────────────────────

export type CheckState = 'done' | 'warn' | 'pending';

/** Where an item's link goes: a Drawer's Handover, or the close flow. */
export type CheckAction =
  | { kind: 'handover'; groupKey: string; label: string }
  | { kind: 'close'; label: string };

export interface CheckItem {
  id: 'readings' | 'handovers' | 'drops' | 'variances' | 'office-count';
  label: string;
  /** The item's state in words ("4 of 6 nozzles"). */
  meta: string;
  state: CheckState;
  action: CheckAction | null;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The Before close checklist: readings captured, every Drawer handed over,
 * Cash Drops, variances, and the office cash count (taken in the close flow).
 * Each item links to where it is fixed.
 */
export function beforeCloseChecklist(
  groups: NozzleGroup[],
  drawers: DrawerFigures,
  formatMoney: (rupees: number) => string,
): CheckItem[] {
  const drawerGroups = groups.filter((g) => g.assignment);
  const pending = drawerGroups.filter((g) => !g.handover);
  const firstPending: CheckAction | null = pending[0]
    ? { kind: 'handover', groupKey: pending[0].key, label: `Record ${pending[0].label} handover` }
    : null;
  const nozzles = groups.flatMap((g) => g.rows.map((r) => ({ r, recorded: !!g.handover })));
  const captured = nozzles.filter((x) => x.recorded).length;
  const flagged = drawers.flagged[0]
    ? groups.find((g) => g.key === drawers.flagged[0].key)
    : undefined;

  return [
    {
      id: 'readings',
      label: 'Closing readings',
      meta: `${captured} of ${plural(nozzles.length, 'nozzle', 'nozzles')}`,
      state: nozzles.length > 0 && captured === nozzles.length ? 'done' : 'pending',
      action: captured < nozzles.length ? firstPending : null,
    },
    {
      id: 'handovers',
      label: 'Handovers',
      meta: `${drawers.recorded} of ${drawers.expected} recorded`,
      state: drawers.expected > 0 && pending.length === 0 ? 'done' : 'pending',
      action: firstPending,
    },
    {
      id: 'drops',
      label: 'Cash drops',
      meta:
        drawers.dropDrawers > 0
          ? `${formatMoney(drawers.drops)} · ${plural(drawers.dropDrawers, 'drawer', 'drawers')}`
          : 'None recorded',
      state: pending.length === 0 ? 'done' : 'pending',
      action: pending.length > 0 ? firstPending : null,
    },
    {
      id: 'variances',
      label: 'Variances',
      meta:
        drawers.flagged.length > 0
          ? `${drawers.flagged.length} over ${formatMoney(VARIANCE_FLAG_RUPEES)}`
          : drawers.recorded > 0
            ? `Within ${formatMoney(VARIANCE_FLAG_RUPEES)}`
            : 'None yet',
      state:
        drawers.flagged.length > 0
          ? 'warn'
          : drawers.recorded > 0 && pending.length === 0
            ? 'done'
            : 'pending',
      action: flagged
        ? { kind: 'handover', groupKey: flagged.key, label: `View ${flagged.label} handover` }
        : null,
    },
    {
      id: 'office-count',
      label: 'Office cash count',
      meta: 'At close',
      state: 'pending',
      action: { kind: 'close', label: 'Count at close' },
    },
  ];
}
