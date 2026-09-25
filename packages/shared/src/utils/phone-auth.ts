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
  // Trunk-prefixed national number (0 + 10 digits), e.g. 09876543210 (#300).
  if (digits.length === 11 && digits.startsWith('0'))
    return `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;

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

/** A valid Indian mobile: 10 digits starting 6–9 (#300). */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Normalize an Indian mobile number to its one stored form, `+91XXXXXXXXXX`,
 * or `null` when it is not a valid Indian mobile. Spaces, dashes, dots and
 * brackets are ignored, as is one leading `+91`, `91` or `0`, so
 * `98765 43210`, `+91 9876543210` and `09876543210` all give `+919876543210`.
 * Its login handle (`phoneToAuthEmail`) is the same for every spelling.
 */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.length === 12 && s.startsWith('91')) s = s.slice(2);
  else if (s.length === 11 && s.startsWith('0')) s = s.slice(1);
  return INDIAN_MOBILE.test(s) ? `+${DEFAULT_COUNTRY_CODE}${s}` : null;
}

export const INDIAN_MOBILE_MESSAGE = 'Enter a valid 10-digit Indian mobile number';
