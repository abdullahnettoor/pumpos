/** A file name part: ASCII letters and digits only, words joined by `_`. */
export function fileSlug(text: string | null | undefined, fallback: string): string {
  const slug = (text ?? '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return slug || fallback;
}

/**
 * The file name (no extension) of a ledger or statement PDF, for the desktop
 * Unified Ledger and the mobile party statements alike:
 * `Ledger_Acme_Transport_2026-09-01_2026-09-18`.
 */
export function ledgerFileName(
  prefix: string,
  name: string | null | undefined,
  range: { from: string; to: string },
  fallback = 'Ledger',
): string {
  return `${prefix}_${fileSlug(name, fallback)}_${range.from}_${range.to}`;
}
