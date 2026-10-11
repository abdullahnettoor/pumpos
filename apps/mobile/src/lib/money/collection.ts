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
  type AccessMode,
  type Role,
} from '@pump/shared';
import { collectionPayload } from '@pump/ui';
import {
  amountForValidation,
  entryDateIssue,
  officePaymentAccess,
  officePaymentFailure,
  type OfficePaymentAccess,
  type OfficePaymentFailure,
} from './officePayment.js';

// The rules a Collection shares with a Supplier Payment (Entry Date, balance
// preview, Idempotency-Key rules, access and refusal wording) live in
// `officePayment.ts`; this file adds only what is a Collection's own.

export type CollectionMethod = 'Cash' | 'UPI' | 'Card' | 'BankTransfer';

/** The methods a Collection can use, in the order the sheet offers them. */
export const COLLECTION_METHODS: readonly { value: CollectionMethod; label: string }[] = [
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Card', label: 'Card' },
  { value: 'BankTransfer', label: 'Bank' },
];

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

      const shared = collectionEntryFormSchema.safeParse({
        ...v,
        // A blank box is a missing amount (the shared rule says so); '' would coerce to 0.
        amount: amountForValidation(v.amount),
        customerId: 'customer',
        terminalId: '',
      });
      if (!shared.success) {
        for (const issue of shared.error.issues) {
          const field = FORM_FIELDS.find((f) => f === issue.path[0]);
          if (field) add(field, issue.message);
        }
      }

      const dateIssue = entryDateIssue(v.entryDate, today);
      if (dateIssue) add('entryDate', dateIssue);
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

/**
 * May this user record a payment from here?
 *
 *  - Role: `canRecordCollection` (every Role except the Attendant), the same
 *    guard `POST /transactions/collections` applies.
 *  - Access mode: the route is declared FINISH_OPEN_WORK ("money handed over by
 *    a customer must be recorded when it is received"), so Restricted Access
 *    still permits it; only Suspension blocks it (`officePaymentAccess`).
 */
export function collectionAccess(input: {
  role: Role;
  accessMode?: AccessMode;
}): OfficePaymentAccess {
  return officePaymentAccess({
    allowed: canRecordCollection(input.role),
    accessMode: input.accessMode,
  });
}

/** What the sheet says when the save is refused or fails. */
export const collectionFailure = (error: unknown): OfficePaymentFailure =>
  officePaymentFailure(error, {
    forbidden: 'You do not have permission to record payments.',
    notFound: 'This customer or account is no longer available.',
  });
