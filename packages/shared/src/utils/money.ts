export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
