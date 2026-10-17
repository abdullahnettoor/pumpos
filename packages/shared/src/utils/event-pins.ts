/**
 * Timeline event pins. Events less than 45 minutes after a pin's FIRST event
 * merge into it, so a pin never spans 45 minutes or more. It carries the icon and tone of its most severe event and the full list of
 * grouped events.
 */

export type PinTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

/** Higher = more severe. */
export const PIN_TONE_SEVERITY: Record<PinTone, number> = {
  neutral: 0,
  success: 1,
  info: 2,
  warning: 3,
  danger: 4,
};

export const PIN_MERGE_MINUTES = 45;

export interface PinEvent {
  id: string;
  /** Epoch ms or ISO string. */
  at: number | string;
  /** Icon key; the card maps it to a glyph. */
  icon: string;
  tone: PinTone;
  label: string;
  href?: string;
}

export interface EventPin {
  /** Time of the group's first event (epoch ms). */
  at: number;
  icon: string;
  tone: PinTone;
  count: number;
  /** Grouped events, oldest first. */
  events: PinEvent[];
}

const ms = (v: number | string): number => (typeof v === 'number' ? v : Date.parse(v));

/**
 * Groups time-sorted events by anchor: an event joins the current pin when it
 * is strictly less than `windowMinutes` after the pin's first event (exactly 45
 * minutes starts a new pin), so a busy stretch stays several readable pins.
 * Severity ties go to the earliest event.
 */
export function groupEventPins(
  events: readonly PinEvent[],
  windowMinutes: number = PIN_MERGE_MINUTES,
): EventPin[] {
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
  const windowMs = windowMinutes * 60_000;
  const groups: PinEvent[][] = [];
  for (const e of sorted) {
    const cur = groups[groups.length - 1];
    if (cur && ms(e.at) - ms(cur[0].at) < windowMs) cur.push(e);
    else groups.push([e]);
  }
  return groups.map((g) => {
    const worst = g.reduce((w, e) =>
      PIN_TONE_SEVERITY[e.tone] > PIN_TONE_SEVERITY[w.tone] ? e : w,
    );
    return { at: ms(g[0].at), icon: worst.icon, tone: worst.tone, count: g.length, events: g };
  });
}
