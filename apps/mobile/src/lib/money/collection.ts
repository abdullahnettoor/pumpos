/**
 * Recording a Collection from the Customer page: the rules, with no React and
 * no fetching.
 *
 * A Collection is an Office Record (ADR 0005): station + Entry Date + payment
 * method + Funding Account, never a Shift or Business Day. The form's fields are
 * checked by `collectionEntryFormSchema` from `@pump/shared` (the rule the
 * desktop quick-entry form and the server hold a collection to); only what the
 * station's clock adds is checked here (an Entry Date that is not in the future).
 * Who may record and what a refusal says are decided here too, so the sheet and
 * the Customer page cannot disagree (`collection.test.ts` pins them).
 */
import { z } from 'zod';
import {
  canRecordCollection,
  collectionEntryFormSchema,
  isValidBusinessDate,
  resolveEntryDate,
  type AccessMode,
  type Role,
} from '@pump/shared';
import { collectionPayload } from '@pump/ui';
import { reusesIdempotencyKey } from './creditLimit.js';

export type CollectionMethod = 'Cash' | 'UPI' | 'Card' | 'BankTransfer';

/** The methods a Collection can use, in the order the sheet offers them. */
export const COLLECTION_METHODS: readonly { value: CollectionMethod; label: string }[] = [
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Card', label: 'Card' },
  { value: 'BankTransfer', label: 'Bank' },
];

/** Longest reference the server accepts (`RecordCollection` notes). */
export const COLLECTION_NOTE_MAX = 500;

/**
 * Today's Entry Date: the plain station-timezone calendar date. Day Start never
 * applies to an Office Record (an entry at 03:00 on the 15th is dated the 15th).
 */
export const entryDateToday = (timeZone: string | null | undefined, now = new Date()): string =>
  resolveEntryDate({ now, timeZone });

/** What the sheet fills in; every field is text, as typed. */
export interface CollectionForm {
  amount: string;
  paymentMethod: CollectionMethod;
  fundingAccountId: string;
  /** `YYYY-MM-DD`, station timezone. */
  entryDate: string;
  /** The optional reference (UPI ref, cheque no.); sent as the collection's notes. */
  notes: string;
}

const FORM_FIELDS = ['amount', 'paymentMethod', 'fundingAccountId', 'entryDate', 'notes'] as const;

/**
 * React Hook Form's resolver schema. The fields are text as typed; the rules
 * are the shared `collectionEntryFormSchema` (amount above 0 within the column
 * and to 2 decimals, a date shape, the account, the reference length), the one
 * the desktop form and the server hold a collection to. `today` is the station's
 * Entry Date today: the server refuses a future date, so the form says so before
 * sending.
 */
export const collectionFormSchema = (today: string) =>
  z
    .object({
      amount: z.string(),
      paymentMethod: z.enum(['Cash', 'UPI', 'Card', 'BankTransfer']),
      fundingAccountId: z.string(),
      entryDate: z.string(),
      notes: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (path: keyof CollectionForm, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      const text = v.amount.trim();
      const shared = collectionEntryFormSchema.safeParse({
        ...v,
        // A blank box is a missing amount (the shared rule says so); '' would coerce to 0.
        amount: text === '' ? undefined : text,
        customerId: 'customer',
        terminalId: '',
      });
      if (!shared.success) {
        for (const issue of shared.error.issues) {
          const field = FORM_FIELDS.find((f) => f === issue.path[0]);
          if (field) add(field, issue.message);
        }
      }

      if (isValidBusinessDate(v.entryDate) && v.entryDate > today)
        add('entryDate', 'The date cannot be in the future.');
      else if (/^\d{4}-\d{2}-\d{2}$/.test(v.entryDate) && !isValidBusinessDate(v.entryDate))
        add('entryDate', 'Choose a real date.');
    });

/**
 * The request body for `POST /transactions/collections`: an Office Record, so a
 * station, an Entry Date and a Funding Account and nothing shift-shaped.
 */
export function collectionRequest(stationId: string, customerId: string, form: CollectionForm) {
  return collectionPayload(stationId, {
    entryDate: form.entryDate,
    customerId,
    amount: Number(form.amount.trim()),
    paymentMethod: form.paymentMethod,
    notes: form.notes.trim(),
    fundingAccountId: form.fundingAccountId,
    terminalId: '',
  });
}

/** The entries that make a save what it is, as the server will read them (trimmed). */
const entriesOf = (f: CollectionForm) =>
  [f.amount.trim(), f.paymentMethod, f.fundingAccountId, f.entryDate, f.notes.trim()].join(
    '\u0000',
  );

/** Are these two forms the same payment? Whitespace around the amount / reference does not count. */
export const sameCollectionEntries = (a: CollectionForm, b: CollectionForm): boolean =>
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
 * that did arrive: the API refuses "same key, different content". The earlier
 * payment is on file, so the caller should read the balance again.
 */
export const isEarlierAttemptReceived = (error: unknown): boolean =>
  codeOf(error) === 'CONFLICT' && !keepsIdempotencyKey(error);

const cents = (n: number) => Math.round(n * 100) / 100;

/** What the Customer would owe once this payment is in (negative = an advance). */
export const balanceAfterPayment = (balance: number, amount: number): number =>
  cents(balance - amount);

export type BalanceAfter =
  | { kind: 'owes'; amount: number }
  | { kind: 'settled'; amount: 0 }
  | { kind: 'advance'; amount: number };

export function amountAfterCollection(balance: number): BalanceAfter {
  if (Math.abs(balance) < 0.005) return { kind: 'settled', amount: 0 };
  return balance > 0
    ? { kind: 'owes', amount: balance }
    : { kind: 'advance', amount: cents(-balance) };
}

/**
 * Write a saved Collection into a cached customers list: the balance falls by
 * the amount (Σ credit sales − Σ collections), keeping the type the list holds
 * it in (the API sends numeric strings). The server's row replaces it on the
 * invalidation that follows.
 */
export function applyCollectionToCustomers<T extends { id: string; currentBalance?: unknown }>(
  list: T[] | undefined,
  customerId: string,
  amount: number,
): T[] | undefined {
  if (!Array.isArray(list)) return list;
  return list.map((c) => {
    if (c.id !== customerId) return c;
    const next = balanceAfterPayment(Number(c.currentBalance ?? 0), amount);
    return { ...c, currentBalance: typeof c.currentBalance === 'string' ? next.toFixed(2) : next };
  });
}

export type CollectionAccess =
  { status: 'hidden' } | { status: 'enabled' } | { status: 'disabled'; reason: string };

/**
 * May this user record a payment from here?
 *
 *  - Role: `canRecordCollection` (every Role except the Attendant), the same
 *    guard `POST /transactions/collections` applies.
 *  - Access mode: the route is declared FINISH_OPEN_WORK ("money handed over by
 *    a customer must be recorded when it is received"), so Restricted Access
 *    still permits it; only Suspension blocks it. An Access Document that has
 *    not loaded is not a refusal: the server decides and its answer is shown on
 *    the sheet.
 */
export function collectionAccess(input: { role: Role; accessMode?: AccessMode }): CollectionAccess {
  if (!canRecordCollection(input.role)) return { status: 'hidden' };
  if (input.accessMode === 'SUSPENDED')
    return {
      status: 'disabled',
      reason: 'Payments cannot be recorded while this organization is suspended.',
    };
  return { status: 'enabled' };
}

export interface CollectionFailure {
  message: string;
}

/** What the sheet says when the save is refused or fails. */
export function collectionFailure(error: unknown): CollectionFailure {
  const serverMessage = error instanceof Error && error.message ? error.message : null;
  switch (codeOf(error)) {
    case 'SUBSCRIPTION_RESTRICTED':
    case 'ORGANIZATION_SUSPENDED':
      return {
        message: serverMessage ?? 'Access is restricted, so the payment cannot be recorded.',
      };
    case 'FORBIDDEN':
      return { message: 'You do not have permission to record payments.' };
    case 'CONFLICT':
      return {
        message: isEarlierAttemptReceived(error)
          ? 'Your earlier attempt was received, so the balance has been refreshed. Check it before recording this payment again.'
          : (serverMessage ??
            'Still saving the earlier attempt. Wait a moment and check the balance.'),
      };
    case 'NOT_FOUND':
      return { message: 'This customer or account is no longer available.' };
    case 'VALIDATION_ERROR':
      return { message: serverMessage ?? 'Check the details and try again.' };
    default:
      return { message: serverMessage ?? 'Could not record the payment. Try again.' };
  }
}
