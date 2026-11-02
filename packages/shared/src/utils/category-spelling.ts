/**
 * Normalises a category string to an identity key:
 * trims whitespace, converts to Unicode NFC, and lowercases.
 * Returns null if the value is null, undefined, not a string, or blank.
 */
export function categoryKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.normalize('NFC').toLowerCase();
}

/**
 * Returns true if both category values identify the same category,
 * ignoring surrounding whitespace, Unicode normalization differences, and case.
 */
export function sameCategory(a: unknown, b: unknown): boolean {
  const keyA = categoryKey(a);
  const keyB = categoryKey(b);
  if (keyA === null || keyB === null) return false;
  return keyA === keyB;
}

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
  const key = categoryKey(raw);
  if (!key) return null;
  const trimmed = (raw as string).trim();

  const matches = existing.filter((e): e is string => categoryKey(e) === key).map((e) => e.trim());

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
    const key = categoryKey(p.category);
    if (!key) continue;

    if (!seen.has(key)) {
      seen.add(key);
      distinct.push((p.category as string).trim());
    }
  }

  distinct.sort((a, b) => a.localeCompare(b));
  return distinct;
}
