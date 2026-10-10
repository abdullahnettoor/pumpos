/**
 * Display formatting for the Insights tab. Pure and string-only: every figure
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

/** ₹32.27L, ₹48.2k, ₹850; "Cr" from a crore. Compact amounts for headline figures. */
export function compactRupees(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const n = Math.abs(amount);
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `${sign}₹${trim(n / 1e3, 1)}k`;
  return `${sign}₹${Math.round(n)}`;
}

/** +₹120 / −₹210 / ₹0: a variance, signed, with a true minus. */
export function signedRupees(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return '₹0';
  return `${amount < 0 ? '−' : '+'}₹${n.toLocaleString('en-IN')}`;
}

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
