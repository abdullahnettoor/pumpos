/**
 * Recording a Collection from the Customer page: the rules, with no React and
 * no fetching.
 *
 * A Collection is an Office Record (ADR 0005): station + Entry Date + payment
 * method + Funding Account, never a Shift or Business Day. The form's fields are
 * checked by `collectionEntryFormSchema` from `@pump/shared` (the rule the
 * desktop quick-entry form and the server hold a collection to); only what a
 * thumb-sized text form adds is checked here (blank amount, the column's
 * range and precision, an Entry Date that is not in the future).
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

export type CollectionMethod = 'Cash' | 'UPI' | 'Card' | 'BankTransfer';

/** The methods a Collection can use, in the order the sheet offers them. */
export const COLLECTION_METHODS: readonly { value: CollectionMethod; label: string }[] = [
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Card', label: 'Card' },
  { value: 'BankTransfer', label: 'Bank' },
];

/** `collections.amount` is numeric(12,2): the largest payment it can hold. */
export const COLLECTION_AMOUNT_MAX = 9_999_999_999.99;

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

const hasAtMostTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) <= 1e-6;

/**
 * React Hook Form's resolver schema. `today` is the station's Entry Date today:
 * the server refuses a future date, so the form says so before sending.
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
      if (text === '') add('amount', 'Enter the amount received.');
      else {
        const n = Number(text);
        if (Number.isFinite(n) && n > 0) {
          if (n > COLLECTION_AMOUNT_MAX) add('amount', 'That is more than a payment can hold.');
          else if (!hasAtMostTwoDecimals(n)) add('amount', 'Use at most 2 decimal places.');
        }
      }

      // The shared rule: amount > 0, a date shape, the account (or a terminal), note length.
      const shared = collectionEntryFormSchema.safeParse({
        ...v,
        amount: text === '' ? undefined : text,
        customerId: 'customer',
        terminalId: '',
      });
      if (!shared.success) {
        for (const issue of shared.error.issues) {
          const field = issue.path[0];
          if (field === 'amount' && text === '') continue;
          if (field === 'amount' && Number(text) > 0 && Number.isFinite(Number(text))) continue;
          if (
            field === 'amount' ||
            field === 'entryDate' ||
            field === 'fundingAccountId' ||
            field === 'notes'
          )
            add(field, issue.message);
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

const codeOf = (e: unknown): string | undefined =>
  e && typeof e === 'object' ? (e as { code?: string }).code : undefined;

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
    case 'NOT_FOUND':
      return { message: 'This customer or account is no longer available.' };
    case 'VALIDATION_ERROR':
      return { message: serverMessage ?? 'Check the details and try again.' };
    default:
      return { message: serverMessage ?? 'Could not record the payment. Try again.' };
  }
}
