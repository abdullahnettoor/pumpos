import { z } from 'zod';
import { organizationUpdateSchema } from '@pump/shared';

/**
 * Organization › Profile (#605): the form's schema over the API's, with the
 * GSTIN and PAN format checks and the state code read from the GSTIN. Pure,
 * so the rules are tested here, never in the screen. The API keeps accepting
 * what it accepted before; the checks are the form's.
 */

/**
 * A GSTIN: 2-digit state code, the 10-character PAN, the entity number
 * (1–9 or A–Z), `Z`, and a check character.
 */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** A PAN: 5 letters, 4 digits, a letter. */
export const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;

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
          message: 'A GSTIN is 15 characters, like 29ABCDE1234F1Z5',
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
