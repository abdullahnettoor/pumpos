import React from 'react';
import { useInventoryStatus, useInventoryItems } from './hooks.js';
import { formatQty } from '../utils/format.js';

/**
 * useStationAlerts — the single source of "things needing attention" derived
 * from station data. Feeds BOTH the top-bar notification bell and the
 * dashboard's exceptions panel so they never drift.
 *
 * Currently covers stock health (tanks low/critical) and oversold inventory.
 * Sync alerts are added by the consumer (they come from connection state, not
 * station data); variance/receivable alerts can be layered on by the consumer
 * from its own data. Thresholds are sensible defaults — make them
 * station-configurable later.
 */

export type AlertSeverity = 'danger' | 'warning' | 'info';

export interface StationAlert {
  id: string;
  severity: AlertSeverity;
  category: 'stock' | 'oversold';
  title: string;
  meta?: string;
  actionLabel?: string;
  actionPath?: string;
}

const SEV_RANK: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function useStationAlerts(
  stationId: string | null | undefined,
  enabled = true,
): StationAlert[] {
  const { data: tanks } = useInventoryStatus(stationId, { enabled } as any);
  const { data: items } = useInventoryItems(stationId, { enabled } as any);

  return React.useMemo(() => {
    if (!enabled) return [];
    const list: StationAlert[] = [];

    (tanks || []).forEach((t: any) => {
      const cap = Number(t.capacity) || 0;
      const vol = Number(t.currentVolume) || 0;
      if (!cap) return;
      const pct = (vol / cap) * 100;
      if (pct < 5) {
        list.push({
          id: `tank-${t.id}`, severity: 'danger', category: 'stock',
          title: `${t.name} critically low`,
          meta: `${t.productName} · ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L`,
          actionLabel: 'Stock', actionPath: '/inventory',
        });
      } else if (pct < 15) {
        list.push({
          id: `tank-${t.id}`, severity: 'warning', category: 'stock',
          title: `${t.name} running low`,
          meta: `${t.productName} · ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L`,
          actionLabel: 'Stock', actionPath: '/inventory',
        });
      }
    });

    (items || []).forEach((i: any) => {
      if (Number(i.quantity) < 0) {
        list.push({
          id: `item-${i.productId}`, severity: 'danger', category: 'oversold',
          title: `${i.name} oversold`,
          meta: `${formatQty(Number(i.quantity))} ${i.unit ?? ''}`.trim(),
          actionLabel: 'Stock', actionPath: '/inventory',
        });
      }
    });

    return list.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  }, [tanks, items, enabled]);
}
