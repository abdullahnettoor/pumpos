import { CloudTransactionService, queryKeys } from '@pump/ui';
import {
  supplierPaymentFailure,
  supplierPaymentRequest,
  type SupplierPaymentForm,
} from '../../lib/money/supplierPayment.js';
import { useOfficePayment } from './useOfficePayment.js';

const service = new CloudTransactionService();

/**
 * Records one Supplier Payment through the existing route
 * (`POST /transactions/supplier-payments`): an Office Record, so the body carries
 * the station, Entry Date and Funding Account and no shift. Caching and the
 * Idempotency-Key rules are `useOfficePayment`'s: the suppliers list takes the
 * lower payable at once and is then re-read; `useInvalidateOperational` also
 * refreshes purchases, account balances and the Daily Cash Book, and the
 * supplier ledger (the statement) is invalidated through its own key.
 *
 * TODO(#399): the payables summary (oldest unpaid, purchased vs paid) adds its
 * keys to `refreshKeys` when it lands.
 */
export function useRecordSupplierPayment(stationId: string, supplierId: string) {
  return useOfficePayment<SupplierPaymentForm>({
    stationId,
    partyId: supplierId,
    partyListKey: 'suppliers',
    refreshKeys: [queryKeys.supplierLedger(supplierId)],
    send: (form, idempotencyKey) =>
      service.recordSupplierPayment(supplierPaymentRequest(stationId, supplierId, form), {
        idempotencyKey,
      }),
    failure: supplierPaymentFailure,
  });
}
