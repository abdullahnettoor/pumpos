/**
 * What the Record payment sheets share: a Collection from a Customer and a
 * Supplier Payment are both Office Records (ADR 0005), so the Entry Date, the
 * Funding Account, the Idempotency-Key rules, the balance preview, the access
 * rule and the wording of a refusal are one set of rules, with no React and no
 * fetching. `collection.ts` and `supplierPayment.ts` add only what differs.
 */
import { isValidBusinessDate, resolveEntryDate, type AccessMode } from '@pump/shared';
import { reusesIdempotencyKey } from './creditLimit.js';

/**
 * Today's Entry Date: the plain station-timezone calendar date. Day Start never
 * applies to an Office Record (an entry at 03:00 on the 15th is dated the 15th).
 */
export const entryDateToday = (timeZone: string | null | undefined, now = new Date()): string =>
  resolveEntryDate({ now, timeZone });

/** The fields every Record payment sheet fills in; each is text, as typed. */
export interface OfficePaymentFields {
  amount: string;
  /** Only a Collection has one: a supplier is paid from an account, whatever its type. */
  paymentMethod?: string;
  fundingAccountId: string;
  /** `YYYY-MM-DD`, station timezone. */
  entryDate: string;
  /** The optional reference (UPI ref, cheque no.); sent as the record's notes. */
  notes: string;
}

/**
 * What the station's clock adds to the shared field rules: the server refuses a
 * future Entry Date, so the form says so before sending. Null when it is fine
 * (the shape of the date is the shared schema's to judge).
 */
export function entryDateIssue(entryDate: string, today: string): string | null {
  if (isValidBusinessDate(entryDate) && entryDate > today)
    return 'The date cannot be in the future.';
  if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate) && !isValidBusinessDate(entryDate))
    return 'Choose a real date.';
  return null;
}

/** The amount as the shared schema should see it: a blank box is a missing amount, not 0. */
export const amountForValidation = (amount: string): string | undefined =>
  amount.trim() === '' ? undefined : amount.trim();

/** The entries that make a save what it is, as the server will read them (trimmed). */
const entriesOf = (f: OfficePaymentFields) =>
  [f.amount.trim(), f.paymentMethod ?? '', f.fundingAccountId, f.entryDate, f.notes.trim()].join(
    '\u0000',
  );

/** Are these two forms the same payment? Whitespace around the amount / reference does not count. */
export const sameOfficeEntries = (a: OfficePaymentFields, b: OfficePaymentFields): boolean =>
  entriesOf(a) === entriesOf(b);

const codeOf = (e: unknown): string | undefined =>
  e && typeof e === 'object' ? (e as { code?: string }).code : undefined;

/**
 * Must the next try of this save carry the SAME Idempotency-Key? Yes while the
 * outcome is unknown: no answer (network drop), a 5xx (the API releases the key),
 * or the API saying the first request with this key is still running. Every
 * other answer is decided (the API caches each 2xx/4xx under its key), so the
 * key is replaced.
 */
export function keepsIdempotencyKey(error: unknown): boolean {
  if (reusesIdempotencyKey(error)) return true;
  return (
    codeOf(error) === 'CONFLICT' &&
    error instanceof Error &&
    /already in progress/i.test(error.message)
  );
}

/**
 * A retry that changed the entries reached the API under the key of an attempt
 * that did arrive: the API refuses "same key, different content" with a CONFLICT
 * (`infra/idempotency.ts`). Only that answer means the earlier payment is on file
 * (so the caller should read the balance again); every other CONFLICT (another
 * request, another user, a business conflict) says nothing about it.
 */
export const isEarlierAttemptReceived = (error: unknown): boolean =>
  codeOf(error) === 'CONFLICT' &&
  error instanceof Error &&
  /different request content/i.test(error.message);

const cents = (n: number) => Math.round(n * 100) / 100;

/** What the party would owe / be owed once this payment is in (negative = paid ahead). */
export const balanceAfterPayment = (balance: number, amount: number): number =>
  cents(balance - amount);

export type BalanceAfter =
  | { kind: 'owes'; amount: number }
  | { kind: 'settled'; amount: 0 }
  | { kind: 'advance'; amount: number };

/** A balance as owed / settled / paid ahead (a negative balance is an advance). */
export function classifyBalance(balance: number): BalanceAfter {
  if (Math.abs(balance) < 0.005) return { kind: 'settled', amount: 0 };
  return balance > 0
    ? { kind: 'owes', amount: balance }
    : { kind: 'advance', amount: cents(-balance) };
}

/**
 * Where the balance would stand once the typed amount is in; null while the box
 * is blank or not a positive number (nothing to preview).
 */
export function previewBalance(balance: number, amountText: string): BalanceAfter | null {
  const text = amountText.trim();
  const amount = Number(text);
  if (text === '' || !Number.isFinite(amount) || amount <= 0) return null;
  return classifyBalance(balanceAfterPayment(balance, amount));
}

/**
 * Write a saved payment into a cached customers / suppliers list: the balance
 * falls by the amount (customers: Σ credit sales − Σ collections; suppliers:
 * Σ purchases − Σ payments), keeping the type the list holds it in (the API
 * sends numeric strings). The server's row replaces it on the invalidation that
 * follows.
 */
export function applyPaymentToParties<T extends { id: string; currentBalance?: unknown }>(
  list: T[] | undefined,
  partyId: string,
  amount: number,
): T[] | undefined {
  if (!Array.isArray(list)) return list;
  return list.map((p) => {
    if (p.id !== partyId) return p;
    const next = balanceAfterPayment(Number(p.currentBalance ?? 0), amount);
    return { ...p, currentBalance: typeof p.currentBalance === 'string' ? next.toFixed(2) : next };
  });
}

export type OfficePaymentAccess =
  { status: 'hidden' } | { status: 'enabled' } | { status: 'disabled'; reason: string };

/**
 * May this user record a payment from here? `allowed` is the server's Role
 * guard for the route. Both routes are declared FINISH_OPEN_WORK ("money paid
 * or handed over must be recorded when it moves"), so Restricted Access still
 * permits them; only Suspension blocks. An Access Document that has not loaded
 * is not a refusal: the server decides and its answer is shown on the sheet.
 */
export function officePaymentAccess(input: {
  allowed: boolean;
  accessMode?: AccessMode;
}): OfficePaymentAccess {
  if (!input.allowed) return { status: 'hidden' };
  if (input.accessMode === 'SUSPENDED')
    return {
      status: 'disabled',
      reason: 'Payments cannot be recorded while this organization is suspended.',
    };
  return { status: 'enabled' };
}

export interface OfficePaymentFailure {
  message: string;
}

/** What differs in the words of a refusal between the two records. */
export interface OfficePaymentWording {
  forbidden: string;
  notFound: string;
}

/** What the sheet says when the save is refused or fails. */
export function officePaymentFailure(
  error: unknown,
  wording: OfficePaymentWording,
): OfficePaymentFailure {
  const serverMessage = error instanceof Error && error.message ? error.message : null;
  switch (codeOf(error)) {
    case 'SUBSCRIPTION_RESTRICTED':
    case 'ORGANIZATION_SUSPENDED':
      return {
        message: serverMessage ?? 'Access is restricted, so the payment cannot be recorded.',
      };
    case 'FORBIDDEN':
      return { message: wording.forbidden };
    case 'CONFLICT':
      return {
        message: isEarlierAttemptReceived(error)
          ? 'Your earlier attempt was received, so the balance has been refreshed. Check it before recording this payment again.'
          : (serverMessage ??
            'Still saving the earlier attempt. Wait a moment and check the balance.'),
      };
    case 'NOT_FOUND':
      return { message: wording.notFound };
    case 'VALIDATION_ERROR':
      return { message: serverMessage ?? 'Check the details and try again.' };
    default:
      return { message: serverMessage ?? 'Could not record the payment. Try again.' };
  }
}
