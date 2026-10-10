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
 * Idempotency-Key rules are `useOfficePayment`'s.
 *
 * The ranged statement and the receivables summary (aging, last payment,
 * usually-pays-in) read the same collections: `useInvalidateOperational` covers
 * their prefixes (`customer-statement`, `receivables`).
 */
export function useRecordCollection(stationId: string, customerId: string) {
  return useOfficePayment<CollectionForm>({
    stationId,
    partyId: customerId,
    partyListKey: 'customers',
    ledgerKey: queryKeys.customerLedger(customerId),
    send: (form, idempotencyKey) =>
      service.recordCollection(collectionRequest(stationId, customerId, form), { idempotencyKey }),
    failure: collectionFailure,
  });
}
