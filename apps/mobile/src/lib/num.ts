/** Number coercion for loosely typed report payloads: anything non-finite is 0. */
export function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
