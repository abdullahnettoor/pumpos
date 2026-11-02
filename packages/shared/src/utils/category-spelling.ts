/**
 * Canonicalises a raw product category against an organization's existing categories.
 *
 * Rules:
 * 1. Trims leading/trailing whitespace.
 * 2. Empty string, whitespace-only, null, undefined, or non-string -> null.
 * 3. If any existing category equals the trimmed value ignoring case (NFC normalized),
 *    returns that existing spelling. When multiple spellings exist (legacy CSV), picks the first
 *    after localeCompare sort.
 * 4. Otherwise returns the trimmed value as typed.
 */
export function canonicalProductCategory(raw: unknown, existing: readonly string[]): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const normalized = trimmed.normalize('NFC').toLowerCase();
  const matches = existing
    .filter(
      (e): e is string =>
        typeof e === 'string' && e.trim().normalize('NFC').toLowerCase() === normalized,
    )
    .map((e) => e.trim());

  if (matches.length > 0) {
    matches.sort();
    return matches[0];
  }

  return trimmed;
}

/**
 * Returns distinct category names across a set of products.
 * Dedupes case-insensitively keeping the first spelling encountered, then sorts using localeCompare.
 */
export function distinctCategories(products: readonly { category?: string | null }[]): string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];

  for (const p of products) {
    if (typeof p.category !== 'string') continue;
    const trimmed = p.category.trim();
    if (trimmed === '') continue;

    const key = trimmed.normalize('NFC').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      distinct.push(trimmed);
    }
  }

  distinct.sort((a, b) => a.localeCompare(b));
  return distinct;
}
