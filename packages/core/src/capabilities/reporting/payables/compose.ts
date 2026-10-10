import type {
  PayablesMonthFigures,
  PayablesSummary,
  SupplierPayable,
  SupplierPayableSummary,
} from '@pump/shared';
import { ageInDays } from '../age.js';
import type { PayableSourceRow, PayablesSource, SupplierPayableSource } from './ports.js';

/** The calendar months "this month" covers for Purchases and for Payments. */
export type PayablesMonths = Pick<PayablesMonthFigures, 'purchasedMonth' | 'paidMonth'>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function composeRow(row: PayableSourceRow, currentBusinessDate: string): SupplierPayable {
  return {
    supplierId: row.supplierId,
    balance: round2(row.balance),
    unpaidCount: row.unpaidCount,
    oldestUnpaidDate: row.oldestUnpaidDate,
    oldestUnpaidDays: row.oldestUnpaidDate
      ? ageInDays(row.oldestUnpaidDate, currentBusinessDate)
      : null,
  };
}

export function composePayables(
  source: PayablesSource,
  currentBusinessDate: string,
  months: PayablesMonths,
): PayablesSummary {
  return {
    total: round2(source.total),
    supplierCount: source.supplierCount,
    month: {
      purchased: round2(source.month.purchased),
      paid: round2(source.month.paid),
      ...months,
    },
    suppliers: source.suppliers.map((row) => composeRow(row, currentBusinessDate)),
  };
}

export function composeSupplierPayable(
  source: SupplierPayableSource,
  currentBusinessDate: string,
  months: PayablesMonths,
): SupplierPayableSummary {
  const { lastPayment, month } = source;
  return {
    ...composeRow(source.payable, currentBusinessDate),
    lastPayment: lastPayment ? { ...lastPayment, amount: round2(lastPayment.amount) } : null,
    month: {
      purchased: round2(month.purchased),
      paid: round2(month.paid),
      ...months,
      purchaseCount: month.purchaseCount,
      quantity: round2(month.quantity),
    },
    purchasesByProduct: source.purchasesByProduct.map((p) => ({
      ...p,
      quantity: round2(p.quantity),
      value: round2(p.value),
    })),
  };
}
