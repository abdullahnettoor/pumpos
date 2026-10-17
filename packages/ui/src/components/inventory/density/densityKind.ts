import type { ChipTone } from '../../../pump-ds/index.js';
import type { DensityReadingKind, DensityReadingWithContext } from '@pump/shared';

/** How each reading kind (routine) reads on screen: sentence case, never the enum. */
export const DENSITY_KIND_LABEL: Record<DensityReadingKind, string> = {
  MORNING: 'Morning',
  ADHOC: 'Ad-hoc',
  DECANTATION: 'Decantation',
};

/**
 * The tone of each reading kind. Only the Δ chip uses it: a Decantation beyond
 * tolerance is a new load, shown in its own tone. Routine chips are neutral
 * (red and amber mean a problem; a routine is not one).
 */
export const DENSITY_KIND_TONE: Record<DensityReadingKind, ChipTone> = {
  MORNING: 'brand',
  ADHOC: 'neutral',
  DECANTATION: 'info',
};

export interface DensityRegisterFilter {
  /** Product id; `''` = all products. */
  productId: string;
  /** Reading kind; `''` = all routines. */
  kind: DensityReadingKind | '';
}

export const ALL_DENSITY_READINGS: DensityRegisterFilter = { productId: '', kind: '' };

/** Every reading kind, in the order the routine filter lists them. */
export const DENSITY_KINDS: DensityReadingKind[] = ['MORNING', 'ADHOC', 'DECANTATION'];

/** The readings the Register shows for a filter, newest first. */
export function filterDensityReadings(
  readings: DensityReadingWithContext[],
  filter: DensityRegisterFilter,
): DensityReadingWithContext[] {
  return readings
    .filter(
      (r) =>
        (!filter.productId || r.productId === filter.productId) &&
        (!filter.kind || r.kind === filter.kind),
    )
    .sort(
      (a, b) =>
        b.businessDate.localeCompare(a.businessDate) || b.recordedAt.localeCompare(a.recordedAt),
    );
}

/**
 * Readings per routine for the Register's routine chips, within the chosen
 * product (the counts say what each chip would show).
 */
export function routineCounts(
  readings: readonly DensityReadingWithContext[],
  productId: string,
): Record<DensityReadingKind | 'ALL', number> {
  const mine = productId ? readings.filter((r) => r.productId === productId) : readings;
  const counts = { ALL: mine.length, MORNING: 0, ADHOC: 0, DECANTATION: 0 };
  for (const r of mine) counts[r.kind] += 1;
  return counts;
}
