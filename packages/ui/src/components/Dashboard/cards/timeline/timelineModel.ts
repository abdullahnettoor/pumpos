import type { DashboardTimeline, EventPin } from '@pump/shared';
import { formatMoney } from '../../../../utils/format.js';

export interface ShiftBarInput {
  id: string;
  name: string;
  sequence: number | null;
  openedAt: string;
  closedAt: string | null;
  /** Closed shifts only: server totals from the dashboard summary. */
  total: number | null;
  variance: number | null;
  /** Scheduled end of the shift's template window (epoch ms), when known. */
  scheduledEndAt?: number | null;
  /** Drawers still to hand over, when known. */
  handoversDue?: number | null;
}

export interface Bar {
  id: string;
  kind: 'closed' | 'running' | 'ghost';
  label: string;
  leftPct: number;
  widthPct: number;
  total: number | null;
  variance: number | null;
  /** Bar text before the reduced-opacity variance suffix. */
  text: string;
  /** Closed shifts: signed variance text ("−₹340"), shown dimmed. */
  varianceText: string | null;
  /** Running shift past its scheduled end. */
  late: boolean;
  /** Short sequence label ("Shift 2"). */
  name: string;
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
  timeZone: string,
): Bar[] {
  const bars: Bar[] = shifts.map((s) => {
    const start = Date.parse(s.openedAt);
    const end = s.closedAt ? Date.parse(s.closedAt) : now;
    const left = axisPct(start, tl);
    const name = s.sequence ? `Shift ${s.sequence}` : s.name;
    const kind = s.closedAt ? 'closed' : 'running';
    const late = kind === 'running' && s.scheduledEndAt != null && now > s.scheduledEndAt;
    const due = s.handoversDue ?? 0;
    const text =
      kind === 'closed'
        ? s.total != null
          ? `${name} · ${money(s.total)}`
          : name
        : late
          ? `${name} · past end${due > 0 ? `, ${due} handover${due === 1 ? '' : 's'} due` : ''}`
          : `${name} · live`;
    return {
      id: s.id,
      kind,
      label: name,
      name,
      text,
      late,
      varianceText:
        kind === 'closed' && s.variance
          ? `${s.variance < 0 ? '−' : '+'}${money(Math.abs(s.variance))}`
          : null,
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
      name: `Shift ${shifts.length + 1}`,
      text: `Shift ${shifts.length + 1} · scheduled ${new Intl.DateTimeFormat('en-IN', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
        .format(tl.nextWindow.startAt)
        .toLowerCase()}, not opened yet`,
      late: false,
      varianceText: null,
      leftPct: left,
      widthPct: Math.max(0.5, axisPct(tl.nextWindow.endAt, tl) - left),
      total: null,
      variance: null,
    });
  }
  return bars;
}

/** Axis ticks every 6h from Day Start to the next one ("6a", "12p", "6p", "12a", "6a"). */
export function axisTicks(
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
  timeZone: string,
): { leftPct: number; label: string }[] {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: true });
  const out: { leftPct: number; label: string }[] = [];
  for (let h = 0; h <= 24; h += 6) {
    const at = tl.dayStartAt + h * 3_600_000;
    const label = fmt.format(at).replace(/\s?(AM|PM)/i, (_, m: string) => m[0].toLowerCase());
    out.push({ leftPct: axisPct(at, tl), label });
  }
  return out;
}

export const pinPct = (pin: EventPin, tl: DashboardTimeline) => axisPct(pin.at, tl);

export const money = (n: number) => formatMoney(n, { decimals: 0 });

/** Scheduled end (epoch ms) of a template window that opened a shift on this day axis. */
export function scheduledEndAt(
  tpl: { startTime: string; endTime: string } | undefined,
  tl: Pick<DashboardTimeline, 'dayStartAt'>,
  dayStartsAt: string,
): number | null {
  if (!tpl) return null;
  const mins = (h: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(h);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  const end = (mins(tpl.endTime) - mins(dayStartsAt) + 1440) % 1440 || 1440;
  return tl.dayStartAt + end * 60_000;
}

/** Clock time in the station timezone: "6 am", "1:52 pm". */
export function clockLabel(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const min = get('minute');
  return `${get('hour')}${min === '00' ? '' : `:${min}`} ${get('dayPeriod').toLowerCase()}`;
}
