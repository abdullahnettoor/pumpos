/**
 * Canonical stock-health thresholds — the SINGLE source of truth so the
 * dashboard/bell alerts, inventory tank cards, and tank KPIs all
 * agree. Previously each surface used its own cutoffs (alerts 5/15, cards
 * 15/35, KPI 35), so a tank could read "Low" on one screen and raise no alert
 * on another. Percentages are of tank capacity.
 *
 * TODO: make these per-station configurable (stations.settings) once operators
 * ask for it; keep the same classifier so every surface stays in sync.
 */
export const TANK_LEVEL = { critical: 15, low: 35 } as const;

export type TankLevel = 'critical' | 'low' | 'ok' | 'over';

export const OVER_CAPACITY_EXPLANATION =
  'Open-shift dispensed fuel may not be deducted from book stock yet. It reconciles when the shift closes.';

/** Percentage full for a tank; values above 100 preserve an over-capacity book position. */
export function tankPct(volume: number, capacity: number): number {
  const cap = Number(capacity) || 0;
  if (!cap) return 0;
  return Math.max(0, ((Number(volume) || 0) / cap) * 100);
}

/** Classify a fill percentage into canonical stock-health states. */
export function classifyTank(pct: number): TankLevel {
  if (pct > 100) return 'over';
  if (pct < TANK_LEVEL.critical) return 'critical';
  if (pct < TANK_LEVEL.low) return 'low';
  return 'ok';
}
