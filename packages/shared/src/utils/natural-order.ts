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
