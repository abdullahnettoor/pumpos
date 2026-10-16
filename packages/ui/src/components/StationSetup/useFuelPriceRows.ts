import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useProducts, usePricing, usePricingHistory } from '../../query/hooks.js';
import {
  buildFuelPriceRows,
  nextScheduledPriceAt,
  type CurrentFuelPrice,
  type FuelPriceHistoryEntry,
} from './fuelPriceRows.js';

/** The longest delay `setTimeout` keeps (about 24.8 days); a later change re-arms. */
const MAX_DELAY_MS = 2_147_483_647;
/** Refetch a moment after the scheduled time, so the server's clock has passed it too. */
const GRACE_MS = 1_000;

/**
 * A station's fuel price rows and the queries they read (#537), shared by
 * Pricing and the Open shift form (#619).
 *
 * `now` is the clock the rows are read at: when the page mounted, moved on
 * when the data changes (a patch or a refetch) and when a scheduled price
 * takes effect. At that moment the current prices are refreshed in the
 * background, so a scheduled price takes over on time without a reload.
 */
export function useFuelPriceRows(stationId: string) {
  const qc = useQueryClient();
  const pricingQ = usePricing(stationId);
  const historyQ = usePricingHistory(stationId);
  const productsQ = useProducts();
  const [tick, setTick] = useState(() => Date.now());
  const now = Math.max(tick, pricingQ.dataUpdatedAt, historyQ.dataUpdatedAt);

  const history = useMemo(
    () => (historyQ.data as FuelPriceHistoryEntry[] | undefined) ?? [],
    [historyQ.data],
  );
  const next = nextScheduledPriceAt(history, now);
  useEffect(() => {
    if (next == null) return;
    const delay = Math.min(Math.max(next - Date.now(), 0) + GRACE_MS, MAX_DELAY_MS);
    const timer = window.setTimeout(() => {
      setTick(Date.now());
      void qc.invalidateQueries({ queryKey: queryKeys.pricing(stationId) });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [next, now, qc, stationId]);

  const rows = useMemo(() => {
    const products = (productsQ.data as { id: string; unit?: string | null }[] | undefined) ?? [];
    const units = new Map(products.map((p) => [p.id, p.unit]));
    const current: CurrentFuelPrice[] = pricingQ.data ?? [];
    return buildFuelPriceRows(current, history, (id) => units.get(id), now);
  }, [pricingQ.data, history, productsQ.data, now]);

  return { rows, now, pricingQ, historyQ, productsQ };
}
