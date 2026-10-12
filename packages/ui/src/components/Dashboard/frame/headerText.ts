/** `Fri 9 Oct` from a YYYY-MM-DD business date (UTC so no timezone drift). */
export function formatDashboardDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** `6:00 am` from "HH:MM". */
export function formatDayStart(hhmm: string | undefined): string {
  const [h, m] = (hhmm ?? '00:00').split(':').map(Number);
  if (h === undefined || Number.isNaN(h)) return '12:00 am';
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** `3:42 pm` in the station timezone. */
export function formatAsOf(now: Date, timeZone?: string): string {
  return now
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
    .toLowerCase();
}

/** "Fri 9 Oct, Sat 10 Oct and Sun 11 Oct" */
export function joinDates(dates: string[]): string {
  const labels = dates.map(formatDashboardDate);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
