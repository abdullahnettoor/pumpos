/**
 * Head type (Direct / Indirect). Every expense head and income head carries one;
 * reports read the head's current value, it is never copied onto an entry.
 * The DB column is `nature`; the UI calls it "Type".
 */
export const HEAD_NATURES = ['DIRECT', 'INDIRECT'] as const;
export type HeadNature = (typeof HEAD_NATURES)[number];

export const DEFAULT_HEAD_NATURE: HeadNature = 'INDIRECT';

export const HEAD_NATURE_LABEL: Record<HeadNature, string> = {
  DIRECT: 'Direct',
  INDIRECT: 'Indirect',
};

export interface DefaultHead {
  name: string;
  nature: HeadNature;
}

/**
 * Heads seeded for a new Organization. Keep the Direct names in step with the
 * `head_nature_defaults` data migration, which classifies already-seeded heads.
 */
export const DEFAULT_EXPENSE_HEADS: readonly DefaultHead[] = [
  { name: 'Staff Tea & Snacks', nature: 'INDIRECT' },
  { name: 'Office Stationery', nature: 'INDIRECT' },
  { name: 'Generator Diesel', nature: 'DIRECT' },
  { name: 'Cleaning & Hygiene', nature: 'INDIRECT' },
  { name: 'General Miscellaneous', nature: 'INDIRECT' },
];

export const DEFAULT_INCOME_HEADS: readonly DefaultHead[] = [
  { name: 'Tanker Rental', nature: 'INDIRECT' },
  { name: 'Truck Parking', nature: 'INDIRECT' },
  { name: 'Commission', nature: 'DIRECT' },
  { name: 'Scrap Sale', nature: 'INDIRECT' },
  { name: 'Interest', nature: 'INDIRECT' },
  { name: 'Other Income', nature: 'INDIRECT' },
];

/** A head's Type as read from storage: anything missing or unknown is Indirect. */
export function headNatureOf(value: unknown): HeadNature {
  return value === 'DIRECT' ? 'DIRECT' : DEFAULT_HEAD_NATURE;
}
