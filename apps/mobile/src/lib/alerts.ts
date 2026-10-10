import { useMemo } from 'react';
import { useStationAlerts, useCustomers, useShiftSummaries, inr } from '@pump/ui';
import type { Station } from '@pump/shared';
import type { TabKey } from '../shell/tabs.js';
import { usePastOpenDates } from './pastOpenDays.js';

export type AlertSeverity = 'danger' | 'warning' | 'info';
export type AlertCategory = 'stock' | 'credit' | 'day' | 'variance';

export interface MobileAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  meta?: string;
  /** Tab to deep-link to when the alert is tapped. */
  tab?: TabKey;
}

const RANK: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };
const VARIANCE_THRESHOLD = 200; // ₹ — flag a closed shift's cash variance beyond this.

/**
 * Unified "needs attention" list for the mobile owner app. Composes the shared
 * stock alerts with money/operational exceptions (credit-limit breaches, an
 * unclosed prior business day, and cash-variance breaches) so the Overview
 * exceptions row and the More → Alerts feed never drift.
 */
export function useMobileAlerts(station: Station | null): MobileAlert[] {
  const stock = useStationAlerts(station?.id, !!station);
  const customersQ = useCustomers();
  const pastOpen = usePastOpenDates(station?.id);
  const summariesQ = useShiftSummaries(station?.id);

  return useMemo(() => {
    if (!station) return [];
    const list: MobileAlert[] = [];

    // Stock (tanks low/critical, oversold merchandise) — from the shared hook.
    for (const a of stock) {
      list.push({
        id: a.id,
        severity: a.severity,
        category: 'stock',
        title: a.title,
        meta: a.meta,
        tab: 'insights',
      });
    }

    // Credit-limit breaches.
    const overLimit = (customersQ.data || []).filter(
      (c: any) =>
        Number(c.creditLimit || 0) > 0 &&
        Number(c.currentBalance || 0) > Number(c.creditLimit || 0),
    );
    if (overLimit.length === 1) {
      const c = overLimit[0];
      list.push({
        id: `credit-${c.id}`,
        severity: 'danger',
        category: 'credit',
        title: `${c.name} over credit limit`,
        meta: `${inr(Number(c.currentBalance || 0))} of ${inr(Number(c.creditLimit || 0))}`,
        tab: 'money',
      });
    } else if (overLimit.length > 1) {
      list.push({
        id: 'credit-many',
        severity: 'danger',
        category: 'credit',
        title: `${overLimit.length} customers over credit limit`,
        tab: 'money',
      });
    }

    // Business days not closed (a prior day still open), one alert each.
    for (const date of pastOpen) {
      list.push({
        id: `day-${date}`,
        severity: 'warning',
        category: 'day',
        title: `Business day ${date} still open`,
        meta: 'Close it in the console to finalize the DSSR',
        tab: 'shifts',
      });
    }

    // Cash-variance breaches on recent closed shifts.
    const recent = (summariesQ.data || [])
      .slice()
      .sort((a: any, b: any) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
      .slice(0, 5);
    for (const s of recent) {
      const v = Number(s.snapshotData?.cashVariance || 0);
      if (Math.abs(v) > VARIANCE_THRESHOLD) {
        list.push({
          id: `var-${s.shiftId ?? s.id}`,
          severity: 'danger',
          category: 'variance',
          title: `Cash variance on ${s.templateName || 'shift'}`,
          meta: `${v < 0 ? 'Short' : 'Over'} ${inr(Math.abs(v))}`,
          tab: 'shifts',
        });
      }
    }

    return list.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  }, [station, stock, customersQ.data, pastOpen, summariesQ.data]);
}
