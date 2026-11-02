import { headNatureOf, round2 } from '@pump/shared';

/** The slice of an expense or income entry the Type totals need. */
export interface NatureAmountRow {
  amount: number | string;
  /** The head's current Type, read live from the head (never stored on the entry). */
  categoryNature?: string | null;
  status?: string | null;
}

export interface NatureTotals {
  direct: number;
  indirect: number;
  grand: number;
}

/**
 * Direct, Indirect and Grand total of a list of entries, voided ones left out.
 * A head with no Type counts as Indirect. Reclassifying a head moves its past
 * entries to the other total because the Type is read from the head each time.
 */
export function splitByNature(rows: readonly NatureAmountRow[]): NatureTotals {
  let direct = 0;
  let indirect = 0;
  for (const r of rows) {
    if (r.status === 'VOIDED') continue;
    const amount = Number(r.amount) || 0;
    if (headNatureOf(r.categoryNature) === 'DIRECT') direct += amount;
    else indirect += amount;
  }
  return { direct: round2(direct), indirect: round2(indirect), grand: round2(direct + indirect) };
}
