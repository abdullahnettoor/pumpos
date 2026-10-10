/**
 * Recording a Supplier Payment from the Supplier page: the rules, with no React
 * and no fetching.
 *
 * A Supplier Payment is an Office Record (ADR 0005): station + Entry Date + the
 * Funding Account it is paid from, never a Shift or Business Day. The API has no
 * payment-method field for it (the account, with its type, is the method), so
 * unlike a Collection the form has none. The fields are checked by
 * `supplierPaymentEntryFormSchema` from `@pump/shared`; only what the station's
 * clock adds is checked here. What it shares with a Collection (Entry Date,
 * Idempotency-Key, preview, access, refusals) is in `officePayment.ts`.
 */
import { z } from 'zod';
import {
  canRecordPurchase,
  supplierPaymentEntryFormSchema,
  type AccessMode,
  type Role,
} from '@pump/shared';
import { supplierPaymentPayload } from '@pump/ui';
import {
  amountForValidation,
  applyPaymentToParties,
  entryDateIssue,
  officePaymentAccess,
  officePaymentFailure,
  sameOfficeEntries,
  type OfficePaymentAccess,
  type OfficePaymentFailure,
} from './officePayment.js';

/** What the sheet fills in; every field is text, as typed. */
export interface SupplierPaymentForm {
  amount: string;
  fundingAccountId: string;
  /** `YYYY-MM-DD`, station timezone. */
  entryDate: string;
  /** The optional reference (cheque no., RTGS ref); sent as the payment's notes. */
  notes: string;
}

const FORM_FIELDS = ['amount', 'fundingAccountId', 'entryDate', 'notes'] as const;

/**
 * React Hook Form's resolver schema: the shared `supplierPaymentEntryFormSchema`
 * (amount above 0 within the column and to 2 decimals, a date shape, the
 * account, the reference length) plus the station's clock: `today` is the
 * Entry Date today, and the server refuses a future date.
 */
export const supplierPaymentFormSchema = (today: string) =>
  z
    .object({
      amount: z.string(),
      fundingAccountId: z.string(),
      entryDate: z.string(),
      notes: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (path: keyof SupplierPaymentForm, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      const shared = supplierPaymentEntryFormSchema.safeParse({
        ...v,
        // A blank box is a missing amount (the shared rule says so); '' would coerce to 0.
        amount: amountForValidation(v.amount),
        supplierId: 'supplier',
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
 * The request body for `POST /transactions/supplier-payments`: an Office Record,
 * so a station, an Entry Date and a Funding Account and nothing shift-shaped.
 */
export function supplierPaymentRequest(
  stationId: string,
  supplierId: string,
  form: SupplierPaymentForm,
) {
  return supplierPaymentPayload(stationId, {
    entryDate: form.entryDate,
    supplierId,
    amount: Number(form.amount.trim()),
    notes: form.notes.trim(),
    fundingAccountId: form.fundingAccountId,
  });
}

/** Are these two forms the same payment? Whitespace around the amount / reference does not count. */
export const sameSupplierPaymentEntries = (
  a: SupplierPaymentForm,
  b: SupplierPaymentForm,
): boolean => sameOfficeEntries(a, b);

/** Write a saved Supplier Payment into a cached suppliers list (the payable falls by the amount). */
export const applyPaymentToSuppliers = applyPaymentToParties;

export type SupplierPaymentAccess = OfficePaymentAccess;

/**
 * May this user record a Supplier Payment from here?
 *
 *  - Role: `canRecordPurchase` (Owner, Manager, Accountant), the guard
 *    `POST /transactions/supplier-payments` applies.
 *  - Access mode: the route is declared FINISH_OPEN_WORK ("cash paid to a
 *    supplier has already gone"), so Restricted Access still permits it; only
 *    Suspension blocks it.
 */
export function supplierPaymentAccess(input: {
  role: Role;
  accessMode?: AccessMode;
}): SupplierPaymentAccess {
  return officePaymentAccess({
    allowed: canRecordPurchase(input.role),
    accessMode: input.accessMode,
  });
}

export type SupplierPaymentFailure = OfficePaymentFailure;

/** What the sheet says when the save is refused or fails. */
export const supplierPaymentFailure = (error: unknown): SupplierPaymentFailure =>
  officePaymentFailure(error, {
    forbidden: 'You do not have permission to record supplier payments.',
    notFound: 'This supplier or account is no longer available.',
  });
