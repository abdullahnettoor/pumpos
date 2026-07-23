/**
 * Phone → synthetic auth-email handle helpers (Phase A).
 *
 * PumpOS provisions phone-based staff logins as a *synthetic email* on a domain
 * we control, because native Supabase phone auth requires a paid SMS provider.
 * The operator only ever sees "my phone + password"; the handle is derived
 * deterministically and NEVER stored — it is recomputed from `users.phone` at
 * create/reset (backend) and at login (frontend).
 *
 * If we later adopt a real phone provider, the migration is a one-time
 * server-side batch (`admin.updateUserById(id, { phone, phone_confirm: true })`)
 * that reuses `normalizePhone` here — no user action required.
 */

/** Domain for synthetic phone-login handles. Never emailed; no MX required. */
export const PHONE_AUTH_DOMAIN = 'users.pumpos.app';

/** Default country calling code (India) applied to bare national numbers. */
export const DEFAULT_COUNTRY_CODE = '91';

/**
 * Normalize a raw phone string to E.164 digits (no `+`, spaces, or separators).
 * A leading `+` is honored. A bare 10-digit national number is prefixed with the
 * default country code. Returns `null` when there are no usable digits.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') return null;

  // Explicit international form (+…) → take the digits as-is.
  if (hadPlus) return digits;

  // Bare national number (India mobile = 10 digits) → prefix country code.
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`;

  return digits;
}

/**
 * Derive the synthetic auth-email handle for a phone number, e.g.
 * `919812345678@users.pumpos.app`. Returns `null` for an unusable phone.
 */
export function phoneToAuthEmail(
  phone: string | null | undefined,
  domain: string = PHONE_AUTH_DOMAIN,
): string | null {
  const normalized = normalizePhone(phone);
  return normalized ? `${normalized}@${domain}` : null;
}

/** Heuristic: does this login identifier look like a phone rather than an email? */
export function looksLikePhone(identifier: string): boolean {
  const trimmed = identifier.trim();
  if (trimmed === '' || trimmed.includes('@')) return false;
  // Digits, spaces, dashes, parens and an optional leading '+' only.
  return /^\+?[\d\s()-]+$/.test(trimmed);
}
