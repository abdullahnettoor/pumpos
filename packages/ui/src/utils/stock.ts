/**
 * Canonical stock-health thresholds — the SINGLE source of truth so the
 * dashboard/bell alerts, the inventory tank cards, and the "tanks low" KPI all
 * agree. Previously each surface used its own cutoffs (alerts 5/15, cards
 * 15/35, KPI 35), so a tank could read "Low" on one screen and raise no alert
 * on another. Percentages are of tank capacity.
 *
 * TODO: make these per-station configurable (stations.settings) once operators
 * ask for it; keep the same classifier so every surface stays in sync.
 */
export const TANK_LEVEL = { critical: 15, low: 35 } as const;

export type TankLevel = 'critical' | 'low' | 'ok';

/** Percentage full (0–100) for a tank; 0 when capacity is unknown. */
export function tankPct(volume: number, capacity: number): number {
  const cap = Number(capacity) || 0;
  if (!cap) return 0;
  return Math.max(0, Math.min(100, ((Number(volume) || 0) / cap) * 100));
}

/** Classify a fill percentage into critical / low / ok using canonical cutoffs. */
export function classifyTank(pct: number): TankLevel {
  if (pct < TANK_LEVEL.critical) return 'critical';
  if (pct < TANK_LEVEL.low) return 'low';
  return 'ok';
}
