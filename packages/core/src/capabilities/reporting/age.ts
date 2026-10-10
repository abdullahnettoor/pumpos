import { businessDateDiffDays } from '@pump/shared';

/**
 * Whole calendar days from a date to a later one; never negative (a back-dated
 * clock cannot age below 0). The one "how old is this entry" rule the
 * receivables and payables reports share.
 */
export const ageInDays = (from: string, to: string): number =>
  Math.max(0, businessDateDiffDays(from, to));
