/**
 * The OMC Card Sales line of a DSSR: fuel paid by an Oil Marketing Company card,
 * settled to the OMC Wallet (ADR 0001). Not a receivable and not a `sales` row,
 * so the DSSR carries it as its own figure beside Credit Sales (`omcCard`).
 * One rule for every reader (desktop view, PDF, mobile) so none prints a line the
 * others hide.
 */
export interface DssrOmcCard {
  total: number;
  /** Number of OMC Card Sale slips behind the total. */
  count: number;
}

/**
 * The line to print, or null: for a snapshot frozen before the field existed
 * (readers print nothing, they never invent a zero) and for a day without any
 * OMC Card Sale (a station that takes no OMC cards sees no empty line).
 */
export function readDssrOmcCard(snapshot: unknown): DssrOmcCard | null {
  const omc = (snapshot as { omcCard?: { total?: unknown; count?: unknown } } | null | undefined)
    ?.omcCard;
  if (!omc || typeof omc !== 'object') return null;
  const total = Number(omc.total ?? 0) || 0;
  const count = Number(omc.count ?? 0) || 0;
  return total === 0 && count === 0 ? null : { total, count };
}
