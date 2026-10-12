import type { DashboardTimeline, EventPin } from '@pump/shared';

export interface ShiftBarInput {
  id: string;
  name: string;
  sequence: number | null;
  openedAt: string;
  closedAt: string | null;
  /** Closed shifts only, from the Shift Summary when it has loaded. */
  total: number | null;
  variance: number | null;
}

export interface Bar {
  id: string;
  kind: 'closed' | 'running' | 'ghost';
  label: string;
  leftPct: number;
  widthPct: number;
  total: number | null;
  variance: number | null;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Position (0–100) of an instant on the Day Start → Day Start axis. */
export function axisPct(
  at: number,
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
): number {
  return clampPct(((at - tl.dayStartAt) / (tl.dayEndAt - tl.dayStartAt)) * 100);
}

export function buildBars(
  shifts: readonly ShiftBarInput[],
  tl: DashboardTimeline,
  now: number,
): Bar[] {
  const bars: Bar[] = shifts.map((s) => {
    const start = Date.parse(s.openedAt);
    const end = s.closedAt ? Date.parse(s.closedAt) : now;
    const left = axisPct(start, tl);
    return {
      id: s.id,
      kind: s.closedAt ? 'closed' : 'running',
      label: s.sequence ? `Shift ${s.sequence}` : s.name,
      leftPct: left,
      widthPct: Math.max(0.5, axisPct(end, tl) - left),
      total: s.total,
      variance: s.variance,
    };
  });
  if (tl.nextWindow) {
    const left = axisPct(tl.nextWindow.startAt, tl);
    bars.push({
      id: `ghost-${tl.nextWindow.templateId}`,
      kind: 'ghost',
      label: tl.nextWindow.name,
      leftPct: left,
      widthPct: Math.max(0.5, axisPct(tl.nextWindow.endAt, tl) - left),
      total: null,
      variance: null,
    });
  }
  return bars;
}

/** Hour ticks (every 3h) with their label, from Day Start. */
export function axisTicks(
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
  timeZone: string,
): { leftPct: number; label: string }[] {
  const fmt = new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: 'numeric',
    hour12: true,
  });
  const out: { leftPct: number; label: string }[] = [];
  for (let h = 0; h < 24; h += 3) {
    const at = tl.dayStartAt + h * 3_600_000;
    out.push({ leftPct: axisPct(at, tl), label: fmt.format(at).toLowerCase() });
  }
  return out;
}

export const pinPct = (pin: EventPin, tl: DashboardTimeline) => axisPct(pin.at, tl);

export const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);

/** Shift total from a Shift Summary snapshot: fuel sales, else cash + credit. */
export function snapshotTotal(s: Record<string, any> | null | undefined): number | null {
  if (!s) return null;
  if (Array.isArray(s.fuelByProduct) && s.fuelByProduct.length > 0) {
    return s.fuelByProduct.reduce((a: number, p: any) => a + Number(p.salesValue || 0), 0);
  }
  return Number(s.cashSalesSum || 0) + Number(s.creditSalesTotal || 0);
}
