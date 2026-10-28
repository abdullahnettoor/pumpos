import { formatCalendarDate, formatInstantDate } from './display-date.js';

function formatBusinessDate(value: string): string {
  return formatCalendarDate(value);
}

/** An instant on the station clock: `5 Oct 2026, 02:00 pm`. */
export function formatStationDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const zone = timeZone || 'Asia/Kolkata';
  const time = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone,
  });
  return `${formatInstantDate(date, zone)}, ${time}`;
}

export function historicalShiftMessage(
  businessDate: string,
  currentBusinessDate: string,
): string | null {
  return businessDate < currentBusinessDate
    ? `Working on ${formatBusinessDate(businessDate)}. Actions are being recorded on ${formatBusinessDate(currentBusinessDate)}.`
    : null;
}
