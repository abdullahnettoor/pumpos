import { formatQty } from '../../utils/format.js';

const isLitre = (unit?: string | null) => !unit?.trim() || /^(l|litre|liter)s?$/i.test(unit.trim());

const trimKl = (kl: number) => formatQty(kl, 1).replace(/\.0$/, '');

/** "12.4 of 20 KL" for litres; "1,200 of 2,000 kg" for anything else. */
export function stockOfCapacity(stock: number, capacity: number, unit?: string | null): string {
  if (isLitre(unit)) return `${formatQty(stock / 1000, 1)} of ${trimKl(capacity / 1000)} KL`;
  return `${formatQty(stock, 0)} of ${formatQty(capacity, 0)} ${unit!.trim()}`;
}
