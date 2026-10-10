import { CloudTransactionService, queryKeys } from '@pump/ui';
import {
  collectionFailure,
  collectionRequest,
  type CollectionForm,
} from '../../lib/money/collection.js';
import { useOfficePayment, type OfficePaymentResult } from './useOfficePayment.js';

const service = new CloudTransactionService();

export type RecordCollectionResult = OfficePaymentResult;

/**
 * Records one Collection through the existing route
 * (`POST /transactions/collections`): an Office Record, so the body carries the
 * station, Entry Date and Funding Account and no shift. Caching and the
 * Idempotency-Key rules are `useOfficePayment`'s: the customers list takes the
 * lower balance at once and is then re-read, and the Customer's ledger, statement
 * (every cached window) and receivable (aging, last payment, usually-pays-in) are
 * invalidated through their own centralized keys.
 */
export function useRecordCollection(stationId: string, customerId: string) {
  return useOfficePayment<CollectionForm>({
    stationId,
    partyId: customerId,
    partyListKey: 'customers',
    refreshKeys: [
      queryKeys.customerLedger(customerId),
      queryKeys.customerStatements(customerId),
      queryKeys.customerReceivable(stationId, customerId),
      queryKeys.receivables(stationId),
    ],
    send: (form, idempotencyKey) =>
      service.recordCollection(collectionRequest(stationId, customerId, form), { idempotencyKey }),
    failure: collectionFailure,
  });
}
