/**
 * Display formatting for the Insights tab (rupees come from `lib/format`). Pure and string-only: every figure
 * arrives computed from the API, so nothing here derives a business number.
 * Dates are plain `YYYY-MM-DD` read by hand (a fixed month table, no `Date`
 * locale formatting: Node's ICU spells September "Sept", the app's ICU does not).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

const trim = (n: number, dec: number) => String(Number(n.toFixed(dec)));

/** 2,180 L, with Indian digit grouping. */
export function litres(n: number): string {
  return `${Math.round(n).toLocaleString('en-IN')} L`;
}

/** "6.4%" for a percent figure (sign supplied by the caller's arrow). */
export function percent(n: number): string {
  return `${trim(Math.abs(n), 1)}%`;
}

/** "3 Oct". */
export function shortDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Wed 7 Oct". */
export function weekdayDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Single-letter weekday for a bar label ("W"). */
export function weekdayInitial(iso: string): string {
  const { y, m, d } = parts(iso);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()][0];
}

/** "3–9 Oct", or "28 Sep – 4 Oct" across a month. */
export function rangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[b.m - 1]}`;
  return `${shortDate(from)} – ${shortDate(to)}`;
}
