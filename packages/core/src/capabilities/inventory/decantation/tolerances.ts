import { DEFAULT_DECANTATION_SETTINGS } from '@pump/shared';

/** Fallback when the caller supplies no station settings (#464). */
export const DEFAULT_DECANTATION_TOLERANCES = {
  densityToleranceKgM3: DEFAULT_DECANTATION_SETTINGS.densityToleranceKgM3,
  settlingTimeMinutes: DEFAULT_DECANTATION_SETTINGS.settlingTimeMinutes,
} as const;
