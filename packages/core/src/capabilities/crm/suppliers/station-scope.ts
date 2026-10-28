/**
 * Which suppliers a Station's supplier list shows (#575). Each pump has its own
 * account with its OMC, so a Station sees:
 *  - suppliers of its own (`stationId` = this Station);
 *  - shared suppliers (`stationId` null), e.g. a lube distributor serving both
 *    pumps;
 *  - and any supplier this Station has ledger entries with, whatever its home
 *    Station: its balance is this Station's debt, so the list must carry it or
 *    the Payable tile would disagree with the list below it.
 *
 * A supplier that belongs only to another Station, with nothing on this
 * Station's ledger, is hidden.
 */
export function suppliersAtStation<S extends { id: string; stationId: string | null }>(
  suppliers: readonly S[],
  stationId: string,
  withLedgerAtStation: ReadonlySet<string>,
): S[] {
  return suppliers.filter(
    (s) => s.stationId === null || s.stationId === stationId || withLedgerAtStation.has(s.id),
  );
}
