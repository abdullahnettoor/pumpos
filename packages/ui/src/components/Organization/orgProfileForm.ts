import { z } from 'zod';
import { organizationUpdateSchema } from '@pump/shared';

/**
 * Organization › Profile (#605): the form's schema over the API's, with the
 * GSTIN and PAN format checks and the state code read from the GSTIN. Pure,
 * so the rules are tested here, never in the screen.
 *
 * Format-only UI help: it catches typos (shape and the GSTIN's check
 * character), it does not verify a registration. The API keeps accepting what
 * it accepted before; these checks are the form's alone.
 */

/**
 * A GSTIN: 2-digit state code, the 10-character PAN, the entity number
 * (1–9 or A–Z), `Z`, and a check character.
 */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** A PAN: 5 letters, 4 digits, a letter. */
export const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The GSTIN's 15th character, the standard mod-36 check: each of the first 14
 * characters' values (0–9, A–Z = 10–35) is weighted 1, 2, 1, 2…, each product
 * contributes its base-36 digits, and the check is what brings the sum to a
 * multiple of 36.
 */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = GSTIN_CHARS.indexOf(first14[i] ?? '') * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] ?? '';
}

/** A well-formed GSTIN whose check character matches. */
export const isValidGstin = (gstin: string): boolean =>
  GSTIN_PATTERN.test(gstin) && gstinCheckChar(gstin) === gstin[14];

const clean = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();

/** The state code a GSTIN starts with, once its first two characters are digits. */
export function gstinStateCode(gstin: string | null | undefined): string | null {
  const m = /^(\d{2})/.exec(clean(gstin));
  return m ? m[1] : null;
}

/**
 * The state code after the GSTIN changes: filled from the GSTIN while it is
 * blank or still the one the previous GSTIN filled in; a code typed by hand
 * stays.
 */
export function autofillStateCode(
  previousGstin: string | null | undefined,
  nextGstin: string | null | undefined,
  stateCode: string | null | undefined,
): string {
  const current = (stateCode ?? '').trim();
  const next = gstinStateCode(nextGstin);
  if (!next) return current;
  return current === '' || current === gstinStateCode(previousGstin) ? next : current;
}

const metadata = organizationUpdateSchema.shape.metadata.unwrap().unwrap();

export const orgProfileSchema = organizationUpdateSchema.extend({
  metadata: metadata
    .extend({
      gstin: z
        .string()
        .optional()
        .nullable()
        .transform((v) => clean(v)),
      pan: z
        .string()
        .optional()
        .nullable()
        .transform((v) => clean(v)),
      stateCode: z
        .string()
        .optional()
        .nullable()
        .transform((v) => (v ?? '').trim()),
    })
    .superRefine((m, ctx) => {
      if (m.gstin && !GSTIN_PATTERN.test(m.gstin)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gstin'],
          message: 'A GSTIN is 15 characters, like 29ABCDE1234F1ZW',
        });
      } else if (m.gstin && !isValidGstin(m.gstin)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gstin'],
          message: 'This GSTIN’s last character doesn’t match: check it for a typo',
        });
      }
      if (m.pan && !PAN_PATTERN.test(m.pan)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pan'],
          message: 'A PAN is 10 characters, like ABCDE1234F',
        });
      }
      if (m.stateCode && !/^\d{2}$/.test(m.stateCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateCode'],
          message: 'A state code is 2 digits',
        });
      } else if (m.stateCode && m.gstin && gstinStateCode(m.gstin) !== m.stateCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateCode'],
          message: `The GSTIN is registered in state ${gstinStateCode(m.gstin)}`,
        });
      }
    })
    // A GSTIN with no state code saves the GSTIN's.
    .transform((m) => ({ ...m, stateCode: m.stateCode || gstinStateCode(m.gstin) || '' })),
});

export type OrgProfileValues = z.input<typeof orgProfileSchema>;
export type OrgProfileBody = z.output<typeof orgProfileSchema>;
