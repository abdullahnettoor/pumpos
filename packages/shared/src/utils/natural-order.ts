/**
 * Natural ("human") ordering for the short alphanumeric labels operators name
 * their hardware with — N1, N2 … N10, DU-1 … DU-12.
 *
 * Plain `localeCompare` is lexicographic, so it files N10 between N1 and N2 and
 * an attendant reading down a handover drawer or a statement PDF loses their
 * place. Postgres `ORDER BY name` has the same problem, so the order is settled
 * here — one comparator, applied wherever these labels are listed, so the
 * drawer, the preview and the exported PDF cannot disagree.
 */
export function compareNatural(a: string | null | undefined, b: string | null | undefined): number {
  // Unnamed rows sort last rather than colliding at the top.
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** `compareNatural` lifted to a field of a record, for `.sort()` call sites. */
export function byNaturalField<T>(
  field: (item: T) => string | null | undefined,
): (a: T, b: T) => number {
  return (a, b) => compareNatural(field(a), field(b));
}

/**
 * How a dispenser unit is labelled for ordering: its code when it has one,
 * otherwise its name.
 *
 * Shared because the fallback IS the rule. Deduplicating only the
 * dispenser-then-nozzle cascade while each site kept its own idea of the
 * dispenser key would leave three rules wearing one name — the API ordered by
 * `duName` alone, so a dispenser named "Pump A" with code "DU-2" landed in a
 * different position in the payload than in the grid that re-sorts it.
 */
export function dispenserLabel(du: {
  duCode?: string | null;
  duName?: string | null;
}): string | null | undefined {
  return du.duCode || du.duName;
}

/**
 * The order a nozzle list is read in: by dispenser unit, then by nozzle, both
 * naturally.
 *
 * The cascade itself — not just the natural compare under it — is the shared
 * rule. It was written out three times in three shapes (the shift-status
 * route, the readings grid, the open-shift form), each reaching for its
 * dispenser label differently, so the same hardware could be listed in
 * different orders on three screens and an attendant reading down a handover
 * drawer would lose their place.
 *
 * Still takes accessors because the sites genuinely disagree about what the
 * nozzle field is called (`nozzleName` vs `name`). The dispenser side no
 * longer disagrees: pass `dispenserLabel`.
 */
export function compareByDispenserThenNozzle<T>(
  dispenser: (item: T) => string | null | undefined,
  nozzle: (item: T) => string | null | undefined,
): (a: T, b: T) => number {
  return (a, b) =>
    compareNatural(dispenser(a), dispenser(b)) || compareNatural(nozzle(a), nozzle(b));
}
