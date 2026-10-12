/** Fuels-card display formatters (station-timezone aware). */

/** `6 Oct` from an ISO instant or business date. */
export const formatDayMonth = (value: string, timeZone?: string): string => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : timeZone,
  });
};

/** `6:10 am` in the station timezone. */
export const formatClock = (iso: string, timeZone?: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone });

/** Litres as KL with one decimal: 12400 → `12.4`. */
export const klText = (kl: number): string => kl.toFixed(1);
