import React from 'react';
import { useInventoryStatus, useInventoryItems } from './hooks.js';
import {
  daysOfCoverLeft,
  deriveDuHandoverStatuses,
  type DensityTodaySummary,
  type HandoverShiftLike,
} from '@pump/shared';
import { formatQty } from '../utils/format.js';
import { tankPct, classifyTank, OVER_CAPACITY_EXPLANATION } from '../utils/stock.js';

/**
 * useStationAlerts — the single source of "things needing attention" derived
 * from station data. Feeds BOTH the top-bar notification bell and the
 * dashboard's exceptions panel so they never drift.
 *
 * Currently covers stock health (tanks low/critical/over capacity) and oversold inventory.
 * Sync alerts are added by the consumer (they come from connection state, not
 * station data); variance/receivable alerts can be layered on by the consumer
 * from its own data. Thresholds are sensible defaults — make them
 * station-configurable later.
 */

export type AlertSeverity = 'danger' | 'warning' | 'info';

/** Shift-side inputs to the derivation (the running shift, today's density, open-shift count). */
export interface ShiftAlertInput {
  now: number;
  timeZone: string;
  /** The running shift from GET /shifts/status (full), or null. */
  activeShift?: (HandoverShiftLike & { handovers?: HandoverShiftLike['handovers'] }) | null;
  /** Closed shifts of the current Business Day. */
  shiftsClosedToday: number;
  /** Active Shift Templates: how many shifts the day is planned to have. */
  plannedShiftCount: number;
  /** GET /transactions/density/today (only the missing-product fields are read). */
  densityToday?: Pick<DensityTodaySummary, 'missingCount' | 'missingProducts'> | null;
}

export interface StationAlert {
  id: string;
  severity: AlertSeverity;
  category: 'stock' | 'oversold' | 'shift' | 'density';
  title: string;
  meta?: string;
  actionLabel?: string;
  actionPath?: string;
  /** Inventory tab + entity to focus when the alert is actioned (deep-link). */
  actionTab?: 'tanks' | 'items';
  actionEntityId?: string;
}

const SEV_RANK: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** To-dos for the running shift, the open-shift prompt and today's density. */
export function deriveShiftAlerts(input: ShiftAlertInput): StationAlert[] {
  const list: StationAlert[] = [];
  const { activeShift, now, timeZone } = input;

  if (activeShift) {
    const statuses = deriveDuHandoverStatuses(activeShift, now, timeZone);
    const open = statuses.filter((s) => s !== 'recorded').length;
    if (open > 0) {
      const overdue = statuses.includes('due');
      const n = `${open} ${open === 1 ? 'handover' : 'handovers'}`;
      list.push({
        id: 'handovers',
        severity: overdue ? 'danger' : 'warning',
        category: 'shift',
        title: overdue ? `${n} overdue` : `${n} to record`,
        actionLabel: 'Open',
        actionPath: '/shifts',
      });
    }
  } else if (input.plannedShiftCount > input.shiftsClosedToday) {
    list.push({
      id: 'open-shift',
      severity: 'info',
      category: 'shift',
      title: `Open Shift ${input.shiftsClosedToday + 1}`,
      actionLabel: 'Open',
      actionPath: '/shifts',
    });
  }

  const missing = input.densityToday;
  if (missing && missing.missingCount > 0) {
    list.push({
      id: 'density',
      severity: 'warning',
      category: 'density',
      title: 'Morning density not recorded',
      meta: missing.missingProducts.map((p) => p.productName).join(' · ') || undefined,
    });
  }

  return list;
}

export function deriveStationAlerts(
  tanks: any[] = [],
  items: any[] = [],
  shift?: ShiftAlertInput | null,
): StationAlert[] {
  const list: StationAlert[] = [];

  tanks.forEach((t: any) => {
    if (t.waitingOnDecantation) {
      list.push({
        id: `decantation-${t.id}`,
        severity: 'warning',
        category: 'stock',
        title: `${t.name} waiting on decantation`,
        meta: 'Pending measurement',
        actionLabel: 'Stock',
        actionPath: '/inventory',
        actionTab: 'tanks',
        actionEntityId: t.id,
      });
    }
    const cap = Number(t.capacity) || 0;
    const vol = Number(t.currentVolume) || 0;
    if (!cap) return;
    const pct = tankPct(vol, cap);
    const level = classifyTank(pct);
    if (level === 'ok') return;
    list.push({
      id: `tank-${t.id}`,
      severity: level === 'critical' ? 'danger' : level === 'over' ? 'info' : 'warning',
      category: 'stock',
      title:
        level === 'critical'
          ? `${t.name} critically low`
          : level === 'over'
            ? `${t.name} book stock over capacity`
            : `${t.name} running low`,
      meta:
        level === 'over'
          ? `${t.productName} · ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L. ${OVER_CAPACITY_EXPLANATION}`
          : [
              `${t.productName} · ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L`,
              // Days of cover from the server; absent without sales history.
              daysOfCoverLeft(t.daysOfCover),
            ]
              .filter(Boolean)
              .join(' · '),
      actionLabel: 'Stock',
      actionPath: '/inventory',
      actionTab: 'tanks',
      actionEntityId: t.id,
    });
  });

  items.forEach((i: any) => {
    if (Number(i.quantity) < 0) {
      list.push({
        id: `item-${i.productId}`,
        severity: 'danger',
        category: 'oversold',
        title: `${i.name} oversold`,
        meta: `${formatQty(Number(i.quantity))} ${i.unit ?? ''}`.trim(),
        actionLabel: 'Stock',
        actionPath: '/inventory',
        actionTab: 'items',
        actionEntityId: i.productId,
      });
    }
  });

  // TODO: raise merchandise low-stock alerts here once products carry a reorder level.

  if (shift) list.push(...deriveShiftAlerts(shift));

  return list.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

/**
 * `shift` (optional, memoised by the caller) adds the shift to-dos: the
 * dashboard's Your shift column passes it; the bell does not.
 */
export function useStationAlerts(
  stationId: string | null | undefined,
  enabled = true,
  shift?: ShiftAlertInput | null,
): StationAlert[] {
  const { data: tanks } = useInventoryStatus(stationId, { enabled } as any);
  const { data: items } = useInventoryItems(stationId, { enabled } as any);

  return React.useMemo(() => {
    if (!enabled) return [];
    return deriveStationAlerts(tanks || [], items || [], shift);
  }, [tanks, items, enabled, shift]);
}
