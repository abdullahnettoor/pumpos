import type {
  CollectionEntryFormValues,
  ExpenseEntryFormValues,
  PurchaseEntryFormValues,
  SupplierPaymentEntryFormValues,
} from '@pump/shared';
import { CloudTransactionService } from '../services/cloud.js';
import {
  collectionPayload,
  expensePayload,
  incomePayload,
  purchasePayload,
  supplierPaymentPayload,
  type PurchasePayNow,
} from '../utils/officeRecordPayloads.js';
import type { OfficeRecordKind } from './kinds.js';

const service = new CloudTransactionService();

/** What one form hands the drawer to save. */
export type OfficeRecordSubmission =
  | { kind: 'expense'; values: ExpenseEntryFormValues }
  | { kind: 'income'; values: ExpenseEntryFormValues }
  | { kind: 'collection'; values: CollectionEntryFormValues }
  | { kind: 'supplier-payment'; values: SupplierPaymentEntryFormValues }
  | { kind: 'purchase'; values: PurchaseEntryFormValues; payment?: PurchasePayNow };

export interface OfficeRecordRequest {
  kind: OfficeRecordKind;
  /** The request body; its JSON is the record's fingerprint for key reuse. */
  body: object;
  send: (idempotencyKey: string) => Promise<unknown>;
}

/**
 * The one submit path per kind (#526): the body every entry point sends and
 * the call that carries the Idempotency-Key. A purchase with "pay now" is one
 * request; the API saves the purchase and its Supplier payment atomically.
 */
export function officeRecordRequest(
  stationId: string,
  submission: OfficeRecordSubmission,
): OfficeRecordRequest {
  const opts = (idempotencyKey: string) => ({ idempotencyKey });
  switch (submission.kind) {
    case 'expense': {
      const body = expensePayload(stationId, submission.values);
      return { kind: 'expense', body, send: (k) => service.recordExpense(body, opts(k)) };
    }
    case 'income': {
      const body = incomePayload(stationId, submission.values);
      return { kind: 'income', body, send: (k) => service.recordIncome(body, opts(k)) };
    }
    case 'collection': {
      const body = collectionPayload(stationId, submission.values);
      return { kind: 'collection', body, send: (k) => service.recordCollection(body, opts(k)) };
    }
    case 'supplier-payment': {
      const body = supplierPaymentPayload(stationId, submission.values);
      return {
        kind: 'supplier-payment',
        body,
        send: (k) => service.recordSupplierPayment(body, opts(k)),
      };
    }
    case 'purchase': {
      const body = purchasePayload(stationId, submission.values, submission.payment);
      return { kind: 'purchase', body, send: (k) => service.recordPurchase(body, opts(k)) };
    }
  }
}
