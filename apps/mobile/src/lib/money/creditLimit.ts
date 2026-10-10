/**
 * Editing a Customer's credit limit: the rules, with no React and no fetching.
 *
 * The amount is checked by `creditLimitSchema` from `@pump/shared`: the one rule
 * the Customer form and the server's create/update use-cases hold a limit to
 * (0 or more, 2 decimals, within numeric(12,2)). Only the text → number step is
 * added here.
 * Who may edit, and what a refusal says, are decided here too so the sheet and
 * the Customer page cannot disagree (and `creditLimit.test.ts` pins them).
 */
import { z } from 'zod';
import { canChangeCreditLimit, creditLimitSchema, type AccessMode, type Role } from '@pump/shared';
import { standing, type MoneyCustomer, type Standing } from './parties.js';

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
  const checked = creditLimitSchema.safeParse(n);
  if (!checked.success)
    return { ok: false, message: checked.error.issues[0]?.message ?? 'Enter a valid amount.' };
  return { ok: true, value: n === 0 ? null : n };
}

/** Longest note the server accepts (`UpdateCustomer`). */
export const LIMIT_NOTE_MAX = 500;

/** The note to send: trimmed, and nothing at all when blank. */
export const noteToSend = (text: string): string | undefined => text.trim() || undefined;

/**
 * React Hook Form's resolver schema: the limit as text, checked by
 * `parseCreditLimit`, and an optional note (why the limit changed).
 */
export const creditLimitFormSchema = z.object({
  creditLimit: z.string().superRefine((text, ctx) => {
    const parsed = parseCreditLimit(text);
    if (!parsed.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message });
  }),
  note: z.string().max(LIMIT_NOTE_MAX, `Keep the note to ${LIMIT_NOTE_MAX} characters.`),
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
 *  - Role: `canChangeCreditLimit` (Owner, Manager). The server enforces the
 *    same rule (`UpdateCustomer` refuses anyone else with FORBIDDEN); this only
 *    decides what to show.
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
