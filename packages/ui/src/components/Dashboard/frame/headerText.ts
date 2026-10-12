import { formatShortDay } from '../../../utils/format.js';

/** "Fri 9 Oct, Sat 10 Oct and Sun 11 Oct" */
export function joinDates(dates: string[]): string {
  const labels = dates.map(formatShortDay);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
