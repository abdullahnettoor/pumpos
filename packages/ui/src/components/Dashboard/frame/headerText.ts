import { formatShortDay } from '../../../utils/format.js';

/** "Fri 9 Oct, Sat 10 Oct and Sun 11 Oct" */
export function joinDates(dates: string[]): string {
  const labels = dates.map(formatShortDay);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export interface OpenDaysSegment {
  /** Bold lead (the date(s)). */
  bold: string;
  rest: string;
}

export interface OpenDaysText {
  segments: OpenDaysSegment[];
  /** True when nothing needs action: the only open past day is waiting on a running shift. */
  info: boolean;
}

/**
 * Open-days notice copy. The Business Day of the running shift cannot be
 * closed until that shift is handed over, so it gets its own info sentence;
 * any other open past days keep the "still open" warning.
 */
export function openDaysText(
  days: string[],
  running: { businessDate: string; sequence: number | null } | null,
): OpenDaysText {
  const waiting = running && days.includes(running.businessDate) ? running : null;
  const others = waiting ? days.filter((d) => d !== waiting.businessDate) : days;
  const segments: OpenDaysSegment[] = [];
  if (waiting) {
    const shift = waiting.sequence ? `Shift ${waiting.sequence}` : 'the running shift';
    segments.push({
      bold: formatShortDay(waiting.businessDate),
      rest: `closes after ${shift} is handed over.`,
    });
  }
  if (others.length > 0) {
    segments.push({
      bold: joinDates(others),
      rest: `${others.length === 1 ? 'is' : 'are'} still open. Their daily reports stay drafts until each day is closed.`,
    });
  }
  return { segments, info: others.length === 0 };
}
