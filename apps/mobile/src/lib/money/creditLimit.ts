/**
 * Editing a Customer's credit limit: the rules, with no React and no fetching.
 *
 * The amount is checked by the same `creditLimit` rule the Customer form uses
 * (`customerCreateSchema`, non-negative); only what that rule cannot know is
 * added here: the text → number step and the `numeric(12,2)` column's range.
 * Who may edit, and what a refusal says, are decided here too so the sheet and
 * the Customer page cannot disagree (and `creditLimit.test.ts` pins them).
 */
import { z } from 'zod';
import {
  canChangeCreditLimit,
  customerCreateSchema,
  type AccessMode,
  type Role,
} from '@pump/shared';
import { standing, type MoneyCustomer, type Standing } from './parties.js';

/** `customers.credit_limit` is numeric(12,2). */
const MAX_LIMIT = 9_999_999_999.99;

export type ParsedLimit = { ok: true; value: number | null } | { ok: false; message: string };

/**
 * Text from the field → the limit to save. Blank and 0 both mean "no limit"
 * (`limitOf` and the desktop form read a 0 limit the same way).
 */
export function parseCreditLimit(text: string): ParsedLimit {
  const raw = text.trim();
  if (raw === '') return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, message: 'Enter a number.' };
  const checked = customerCreateSchema.shape.creditLimit.safeParse(n);
  if (!checked.success) return { ok: false, message: 'Enter 0 or more.' };
  if (n > MAX_LIMIT) return { ok: false, message: 'That is more than a limit can hold.' };
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6)
    return { ok: false, message: 'Use at most 2 decimal places.' };
  return { ok: true, value: n === 0 ? null : n };
}

/** React Hook Form's resolver schema: one text field, checked by `parseCreditLimit`. */
export const creditLimitFormSchema = z.object({
  creditLimit: z.string().superRefine((text, ctx) => {
    const parsed = parseCreditLimit(text);
    if (!parsed.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message });
  }),
});
export type CreditLimitForm = z.infer<typeof creditLimitFormSchema>;

/** Where the Customer would stand at `limit`, on the balance they owe now. */
export function previewStanding(
  customer: Pick<MoneyCustomer, 'currentBalance'>,
  limit: number | null,
): Standing {
  return standing({ currentBalance: customer.currentBalance, creditLimit: limit });
}

export type CreditLimitAccess =
  { status: 'hidden' } | { status: 'enabled' } | { status: 'disabled'; reason: string };

/**
 * May this user change this Customer's limit from here?
 *
 *  - Role: `canChangeCreditLimit` (Owner, Manager). The API's route guard is
 *    wider (Accountants may edit a Customer), so this is the stricter, intended
 *    rule; the API stays the authority for everything else.
 *  - Only Credit and Fleet Customers carry a limit.
 *  - `PUT /transactions/customers/:id` is BLOCKED under Restricted Access and
 *    Suspension, so the action is disabled with the reason. An Access Document
 *    that has not loaded is not a refusal: the server decides, and its answer is
 *    shown on the sheet.
 */
export function creditLimitAccess(input: {
  role: Role;
  customerType?: string | null;
  accessMode?: AccessMode;
}): CreditLimitAccess {
  if (!canChangeCreditLimit(input.role)) return { status: 'hidden' };
  if (input.customerType !== 'Credit' && input.customerType !== 'Fleet')
    return { status: 'hidden' };
  if (input.accessMode === 'RESTRICTED' || input.accessMode === 'SUSPENDED')
    return {
      status: 'disabled',
      reason:
        input.accessMode === 'SUSPENDED'
          ? 'Changes are paused while this organization is suspended.'
          : 'Limits cannot be changed while access is restricted.',
    };
  return { status: 'enabled' };
}

export interface CreditLimitFailure {
  message: string;
}

const codeOf = (e: unknown): string | undefined =>
  e && typeof e === 'object' ? (e as { code?: string }).code : undefined;

/** What the sheet says when the save is refused or fails. */
export function creditLimitFailure(error: unknown): CreditLimitFailure {
  const code = codeOf(error);
  const serverMessage = error instanceof Error && error.message ? error.message : null;
  switch (code) {
    case 'SUBSCRIPTION_RESTRICTED':
    case 'ORGANIZATION_SUSPENDED':
      return { message: serverMessage ?? 'Access is restricted, so the limit cannot be changed.' };
    case 'VALIDATION_ERROR':
      return { message: 'Enter a valid amount.' };
    case 'FORBIDDEN':
      return { message: 'You do not have permission to change this limit.' };
    case 'NOT_FOUND':
      return { message: 'This customer is no longer available.' };
    default:
      return { message: serverMessage ?? 'Could not save the limit. Try again.' };
  }
}

/**
 * The API caches every decided answer (2xx/4xx) under the Idempotency-Key, so a
 * retry after a refusal needs a fresh key; a retry whose outcome is unknown
 * (network drop, 5xx) must reuse the key so the change cannot apply twice.
 */
export function reusesIdempotencyKey(error: unknown): boolean {
  const status =
    error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
  return status === undefined || status >= 500;
}
