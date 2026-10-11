export const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const UUID = new RegExp(UUID_PATTERN, 'i');

/** Postgres-compatible UUID shape check (versions and variants are not restricted). */
export const isUuid = (value: string): boolean => UUID.test(value);

/** Snapshot UUID as text, or null if malformed, for safe SQL casts. */
export function uuidOrNull(value: string | null | undefined): string | null {
  return value && isUuid(value) ? value : null;
}
