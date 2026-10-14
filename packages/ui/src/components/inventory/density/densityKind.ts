import type { ChipTone } from '../../../pump-ds/index.js';
import type { DensityReadingKind } from '@pump/shared';

/**
 * The tone of each reading kind, shared by the Register's routine chip and the
 * Δ chip (a Decantation beyond tolerance is a new load, shown in its own tone).
 */
export const DENSITY_KIND_TONE: Record<DensityReadingKind, ChipTone> = {
  MORNING: 'brand',
  ADHOC: 'neutral',
  DECANTATION: 'info',
};
