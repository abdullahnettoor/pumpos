import { describe, expect, it } from 'vitest';
import { withBilledSale, withHandoverProductSale, withoutSale } from './productSales.js';

const row = (id: string, attendantId: string, createdAt: string) => ({
  id,
  attendantId,
  attendantName: 'Ravi',
  subtotalAmount: '400.00',
  taxAmount: '72.00',
  totalAmount: '472.00',
  nonCashAmount: '0',
  createdAt,
  items: [],
});

describe('Product sales list patches (#606)', () => {
  it('a newer Handover Product Sale replaces the employee’s and leads the list', () => {
    const list = [
      row('m-old', 'u-ravi', '2026-10-15T07:00:00.000Z'),
      row('m-x', 'u-meena', '2026-10-15T06:00:00.000Z'),
    ];
    const next = withHandoverProductSale(list, row('m-new', 'u-ravi', '2026-10-15T09:00:00.000Z'));
    expect(next.map((r) => r.id)).toEqual(['m-new', 'm-x']);
  });

  it('drops an older answer arriving after a newer save or refetch', () => {
    const list = [row('m-new', 'u-ravi', '2026-10-15T09:00:00.000Z')];
    expect(withHandoverProductSale(list, row('m-old', 'u-ravi', '2026-10-15T08:59:00.000Z'))).toBe(
      list,
    );
    expect(withHandoverProductSale(list, list[0])).toBe(list);
  });

  it('a billed sale is listed once; a removal drops only its sale', () => {
    const list = [{ id: 'b-1' }];
    expect(
      withBilledSale(list, {
        ...row('b-1', 'u-ravi', ''),
        documentNumber: null,
        customerId: null,
        customerName: null,
        buyerDetails: null,
        paymentMethod: 'Cash',
      }),
    ).toBe(list);
    expect(withoutSale(list, 'b-9')).toBe(list);
    expect(withoutSale(list, 'b-1')).toEqual([]);
  });
});
