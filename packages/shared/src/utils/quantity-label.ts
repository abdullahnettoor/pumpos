/** Display labels for fuel and product quantities. Pure. */

/** The unit as shown: `L` for any litre spelling, `kg` for kilograms; blank reads as litres. */
export const unitLabel = (unit: unknown): string => {
  const u = typeof unit === 'string' ? unit.trim() : '';
  if (!u || /^(l|ltr|litre|liter)s?$/i.test(u)) return 'L';
  if (/^(kg|kilogram)s?$/i.test(u)) return 'kg';
  return u;
};

/** `22,000 L` (whole units; litres and nos are never fractional in practice). */
export const wholeQuantityLabel = (quantity: number, unit: string): string => {
  const u = unit ? unitLabel(unit) : '';
  return `${Math.round(quantity).toLocaleString('en-IN')} ${u}`.trim();
};

/** "2,211 L", or "100 L · 40 kg": volumes are never added across units. `0 L` when empty. */
export const volumeLabel = (
  perUnit: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
): string => {
  const entries = perUnit instanceof Map ? [...perUnit] : Object.entries(perUnit);
  return entries.map(([unit, qty]) => wholeQuantityLabel(qty, unit)).join(' · ') || '0 L';
};
