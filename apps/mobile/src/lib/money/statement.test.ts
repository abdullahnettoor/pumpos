import { describe, expect, it } from 'vitest';
import { deltaOf, fullDayLabel, type LedgerRow } from '@pump/ui';
import { buildStatement, statementWindowStart } from './statement.js';

const row = (
  id: string,
  transactionType: string,
  amount: number,
  businessDate: string,
  extra: Partial<LedgerRow> = {},
): LedgerRow => ({ id, transactionType, amount: String(amount), businessDate, ...extra });

// Oldest first, as the ledger endpoint returns them.
const LEDGER: LedgerRow[] = [
  row('o', 'Opening Balance', 5000, '2026-08-31'),
  row('a', 'Credit Sale', 5375, '2026-09-16'),
  row('b', 'Collection', 4000, '2026-09-18', { notes: 'UPI' }),
  row('c', 'Credit Sale', 12540, '2026-10-07'),
  row('d', 'Credit Sale', 8510, '2026-10-08'),
];

describe('buildStatement', () => {
  it('runs the balance from the oldest row and ends on the Customer balance', () => {
    const s = buildStatement(LEDGER);
    // Σ credit sales + opening − collections
    expect(s.closingBalance).toBe(5000 + 5375 - 4000 + 12540 + 8510);
    const all = s.months.flatMap((m) => m.entries);
    expect(all.map((e) => e.balance)).toEqual([27425, 18915, 6375, 10375, 5000]);
  });

  describe('reconciling with the server balance', () => {
    const CLOSING = 27425;

    it('shows running balances when the ledger closes on the server balance', () => {
      const s = buildStatement(LEDGER, 20, CLOSING);
      expect(s.reconciled).toBe(true);
      expect(s.months.flatMap((m) => m.entries).map((e) => e.balance)).toEqual([
        27425, 18915, 6375, 10375, 5000,
      ]);
    });

    it('tolerates float dust', () => {
      expect(buildStatement(LEDGER, 20, CLOSING + 0.004).reconciled).toBe(true);
    });

    it('is partial, with no running balance on any row, when the ledger closes elsewhere', () => {
      const s = buildStatement(LEDGER, 20, 31000);
      expect(s.reconciled).toBe(false);
      expect(s.closingBalance).toBe(CLOSING);
      const entries = s.months.flatMap((m) => m.entries);
      expect(entries).toHaveLength(5);
      expect(entries.every((e) => e.balance === null)).toBe(true);
      // The amounts of each row are still shown.
      expect(entries[0]).toMatchObject({ key: 'd', delta: 8510 });
    });

    it('is partial when there are no rows but a balance is owed, and fine at zero', () => {
      expect(buildStatement([], 20, 1200).reconciled).toBe(false);
      expect(buildStatement([], 20, 0).reconciled).toBe(true);
    });

    it('does not check when no expected balance is given', () => {
      expect(buildStatement(LEDGER).reconciled).toBe(true);
    });
  });

  it('lists newest first, grouped by month with a heading', () => {
    const s = buildStatement(LEDGER);
    expect(s.months.map((m) => m.label)).toEqual(['October 2026', 'September 2026', 'August 2026']);
    expect(s.months[0].entries.map((e) => e.key)).toEqual(['d', 'c']);
    expect(s.months[1].entries.map((e) => e.key)).toEqual(['b', 'a']);
  });

  it('labels the four ledger types and shows a collection as a reduction', () => {
    const entries = buildStatement(LEDGER).months.flatMap((m) => m.entries);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    expect(byKey.o.label).toBe('Opening balance');
    expect(byKey.a.label).toBe('Credit Sale');
    expect(byKey.b).toMatchObject({
      label: 'Payment received',
      delta: -4000,
      meta: '18 Sep · UPI',
    });
    expect(
      buildStatement([row('x', 'Adjustment', 100, '2026-10-01')]).months[0].entries[0],
    ).toMatchObject({ label: 'Adjustment', delta: 100 });
  });

  it('pages: shows the newest N, keeps balances computed over everything', () => {
    const s = buildStatement(LEDGER, 2);
    expect(s).toMatchObject({ shown: 2, total: 5, hasMore: true });
    expect(s.months).toHaveLength(1);
    expect(s.months[0].entries[0].balance).toBe(27425);
    expect(buildStatement(LEDGER, 99).hasMore).toBe(false);
  });

  it('has no closing balance and no months for an empty ledger', () => {
    expect(buildStatement([])).toMatchObject({ months: [], total: 0, closingBalance: null });
  });

  it('does not drift on paise', () => {
    const s = buildStatement([
      row('a', 'Credit Sale', 0.1, '2026-10-01'),
      row('b', 'Credit Sale', 0.2, '2026-10-02'),
    ]);
    expect(s.closingBalance).toBe(0.3);
  });

  it('falls back to the created-at date, and tolerates an unknown type', () => {
    const s = buildStatement([
      { id: 'z', transactionType: 'Writeoff', amount: 10, createdAt: '2026-10-09T05:00:00Z' },
    ]);
    expect(s.months[0]).toMatchObject({ label: 'October 2026' });
    expect(s.months[0].entries[0]).toMatchObject({ label: 'Writeoff', meta: '9 Oct' });
  });

  it('only a Collection reduces the balance', () => {
    expect(deltaOf('Collection', 50)).toBe(-50);
    expect(deltaOf('Credit Sale', 50)).toBe(50);
    expect(deltaOf(null, 50)).toBe(50);
  });
});

describe('supplier statement', () => {
  // Σ purchases − payments; a Payment reduces what you owe.
  const SUPPLIER: LedgerRow[] = [
    row('o', 'Opening Balance', 50000, '2026-08-31'),
    row('p1', 'Purchase', 1043200, '2026-09-27', { notes: 'INV-1' }),
    row('pay1', 'Payment', 1110000, '2026-09-29'),
    row('p2', 'Purchase', 1029000, '2026-10-03'),
    row('pay2', 'Payment', 980000, '2026-10-06'),
    row('p3', 'Purchase', 1043200, '2026-10-09'),
  ];

  it('runs the balance with a Payment as the reduction and closes on the supplier balance', () => {
    const s = buildStatement(SUPPLIER, 20, 1075400, 'supplier');
    expect(s.reconciled).toBe(true);
    expect(s.closingBalance).toBe(1075400);
    expect(s.months.flatMap((m) => m.entries).map((e) => e.balance)).toEqual([
      1075400, 32200, 1012200, -16800, 1093200, 50000,
    ]);
  });

  it('goes negative (an advance) across months and keeps the sign', () => {
    const s = buildStatement(SUPPLIER.slice(0, 3), 20, -16800, 'supplier');
    expect(s.reconciled).toBe(true);
    const entries = s.months.flatMap((m) => m.entries);
    expect(entries[0]).toMatchObject({ key: 'pay1', delta: -1110000, balance: -16800 });
    expect(s.months.map((m) => m.label)).toEqual(['September 2026', 'August 2026']);
  });

  it('labels purchases and payments, and a Collection does not reduce a supplier balance', () => {
    const entries = buildStatement(SUPPLIER, 20, undefined, 'supplier').months.flatMap(
      (m) => m.entries,
    );
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    expect(byKey.p1).toMatchObject({ label: 'Purchase', delta: 1043200, meta: '27 Sep · INV-1' });
    expect(byKey.pay1).toMatchObject({ label: 'Payment made', delta: -1110000 });
    expect(deltaOf('Payment', 5, 'supplier')).toBe(-5);
    expect(deltaOf('Collection', 5, 'supplier')).toBe(5);
    expect(deltaOf('Payment', 5)).toBe(5);
  });
});

describe('windowed statement (ranged ledger)', () => {
  it('starts the running balance from the period opening balance and reconciles on the closing one', () => {
    const rows = [
      row('a', 'Credit Sale', 500, '2026-10-02'),
      row('b', 'Collection', 200, '2026-10-05'),
    ];
    const s = buildStatement(rows, 20, 1800, 'customer', 1500);
    expect(s.reconciled).toBe(true);
    expect(s.closingBalance).toBe(1800);
    expect(s.months.flatMap((m) => m.entries).map((e) => e.balance)).toEqual([1800, 2000]);
  });

  it('is partial when the opening balance does not lead to the server balance', () => {
    expect(
      buildStatement([row('a', 'Credit Sale', 500, '2026-10-02')], 20, 999, 'customer', 1500)
        .reconciled,
    ).toBe(false);
  });

  it('reconciles an empty window on the opening balance alone', () => {
    const s = buildStatement([], 20, 1500, 'customer', 1500);
    expect(s.reconciled).toBe(true);
    expect(s.total).toBe(0);
  });
});

describe('server running balance (ranged ledger)', () => {
  const served = [
    row('a', 'Credit Sale', 500, '2026-10-02', { runningBalance: '2000.00' }),
    row('b', 'Collection', 200, '2026-10-05', { runningBalance: '1800.00' }),
  ];

  it("shows the server's running balance on every row, not a client sum", () => {
    // The opening balance given here would make a client sum 1500 + 500 = 2000, 1800.
    // The server's figures are deliberately different: they are what is shown.
    const odd = served.map((r, i) => ({ ...r, runningBalance: i === 0 ? '777.00' : '555.00' }));
    const s = buildStatement(odd, 20, undefined, 'customer', 1500);
    expect(s.months.flatMap((m) => m.entries).map((e) => e.balance)).toEqual([555, 777]);
    expect(s.closingBalance).toBe(555);
  });

  it('trusts them without checking against the balance on record (that one may be later)', () => {
    // A past range does not end on today's balance.
    const s = buildStatement(served, 20, 99999, 'customer', 1500);
    expect(s.reconciled).toBe(true);
    expect(s.months.flatMap((m) => m.entries).every((e) => e.balance !== null)).toBe(true);
  });

  it('keeps the signed effect of each row for its +/- display', () => {
    const s = buildStatement(served, 20, undefined, 'customer', 1500);
    expect(s.months.flatMap((m) => m.entries).map((e) => e.delta)).toEqual([-200, 500]);
  });

  it('falls back to the client sum, checked, when a row has no server balance (legacy ledger)', () => {
    const mixed = [served[0], { ...served[1], runningBalance: null }];
    expect(buildStatement(mixed, 20, 999, 'customer', 1500).reconciled).toBe(false);
    expect(buildStatement(mixed, 20, 1800, 'customer', 1500).reconciled).toBe(true);
  });
});

describe('enriched customer rows', () => {
  const sale = row('s', 'Credit Sale', 10750, '2026-10-09', {
    shiftBusinessDate: '2026-10-09',
    shiftSequence: 1,
    productName: 'Diesel',
    quantity: 120,
    unit: 'L',
    vehicleRegistration: 'KL-11-AB-4521',
  });
  const entryOf = (r: LedgerRow) => buildStatement([r]).months[0].entries[0];

  it('names the Shift, what was sold and the Vehicle on a Credit Sale', () => {
    expect(entryOf(sale)).toMatchObject({
      label: 'Credit Sale',
      meta: '9 Oct · Shift 20261009-1',
      detail: '120 L Diesel · KL-11-AB-4521',
    });
  });

  it('formats litres without trailing zeros and groups thousands the Indian way', () => {
    expect(entryOf({ ...sale, quantity: '2.500' }).detail).toBe('2.5 L Diesel · KL-11-AB-4521');
    expect(entryOf({ ...sale, quantity: 12345.678 }).detail).toBe(
      '12,345.68 L Diesel · KL-11-AB-4521',
    );
  });

  it('leaves out what a sale does not have: no Vehicle, no Shift, no quantity', () => {
    expect(entryOf({ ...sale, vehicleRegistration: null }).detail).toBe('120 L Diesel');
    expect(entryOf({ ...sale, shiftSequence: null }).meta).toBe('9 Oct');
    expect(entryOf({ ...sale, quantity: null, productName: null }).detail).toBe('KL-11-AB-4521');
    expect(
      entryOf({ ...sale, quantity: null, vehicleRegistration: null, notes: 'Bill 12' }).detail,
    ).toBe('Bill 12');
  });

  it('shows the method and reference on a Collection', () => {
    const e = entryOf(
      row('c', 'Collection', 40000, '2026-09-18', { method: 'UPI', reference: 'COL-000042' }),
    );
    expect(e).toMatchObject({
      label: 'Payment received',
      meta: '18 Sep · UPI · Ref COL-000042',
      delta: -40000,
    });
    expect(entryOf(row('c', 'Collection', 1, '2026-09-18', { method: 'BankTransfer' })).meta).toBe(
      '18 Sep · Bank transfer',
    );
    expect(
      entryOf(row('c', 'Collection', 1, '2026-09-18', { method: 'Cash', notes: 'cheque' })).detail,
    ).toBe('cheque');
  });

  it('keeps the note on a legacy row with none of the enrichment', () => {
    expect(entryOf(row('x', 'Adjustment', 5, '2026-10-01', { notes: 'rounding' }))).toMatchObject({
      meta: '1 Oct · rounding',
      detail: null,
    });
  });
});

describe('enriched supplier rows', () => {
  const purchase = row('p', 'Purchase', 1043200, '2026-10-09', {
    invoiceNumber: 'INV-55821',
    productName: 'Diesel',
    quantity: 12000,
    unit: 'L',
    tankerNumber: 'KL-58-H-2210',
  });
  const payment = row('y', 'Payment', 980000, '2026-10-06', {
    method: 'BANK',
    fundingAccountName: 'SBI current a/c',
  });
  const entryOf = (r: LedgerRow) =>
    buildStatement([r], 20, undefined, 'supplier').months[0].entries[0];

  it('names the product, invoice, quantity and tanker on a Purchase', () => {
    expect(entryOf(purchase)).toMatchObject({
      label: 'Purchase · Diesel',
      meta: '9 Oct · INV-55821 · 12,000 L',
      detail: 'Tanker KL-58-H-2210',
      delta: 1043200,
    });
  });

  it('shows the method in words and the Funding Account on a Payment', () => {
    expect(entryOf(payment)).toMatchObject({
      label: 'Payment made',
      meta: '6 Oct · Bank',
      detail: 'From SBI current a/c',
      delta: -980000,
    });
    expect(entryOf({ ...payment, method: 'CASH_IN_HAND' }).meta).toBe('6 Oct · Cash in Hand');
  });

  it('leaves out what a row does not have: no tanker, no invoice, no quantity', () => {
    expect(entryOf({ ...purchase, tankerNumber: null }).detail).toBeNull();
    expect(entryOf({ ...purchase, tankerNumber: null, notes: 'urgent' }).detail).toBe('urgent');
    expect(entryOf({ ...purchase, invoiceNumber: null }).meta).toBe('9 Oct · 12,000 L');
    expect(entryOf({ ...purchase, quantity: null, unit: null }).meta).toBe('9 Oct · INV-55821');
    expect(entryOf({ ...payment, fundingAccountName: null }).detail).toBeNull();
  });

  it('keeps a plain Purchase label and the note on a legacy row with none of the enrichment', () => {
    expect(entryOf(row('x', 'Purchase', 5, '2026-10-01', { notes: 'INV-1' }))).toMatchObject({
      label: 'Purchase',
      meta: '1 Oct · INV-1',
      detail: null,
    });
    expect(entryOf(row('o', 'Opening Balance', 5, '2026-10-01'))).toMatchObject({
      label: 'Opening balance',
      meta: '1 Oct',
    });
  });

  it('runs a negative balance (an advance) across an overpaid payment', () => {
    const s = buildStatement(
      [row('a', 'Purchase', 100, '2026-10-01'), row('b', 'Payment', 250, '2026-10-02')],
      20,
      -150,
      'supplier',
    );
    expect(s.months[0].entries.map((e) => e.balance)).toEqual([-150, 100]);
    expect(s.reconciled).toBe(true);
  });
});

describe('statement order', () => {
  it('orders by date, so a back-dated row lands in its own month and the balance follows', () => {
    const s = buildStatement(
      [
        row('late', 'Credit Sale', 100, '2026-10-02', { createdAt: '2026-10-02T10:00:00Z' }),
        // created last but dated in September
        row('back', 'Credit Sale', 50, '2026-09-30', { createdAt: '2026-10-05T10:00:00Z' }),
      ],
      20,
      150,
    );
    expect(s.months.map((m) => m.label)).toEqual(['October 2026', 'September 2026']);
    expect(s.months[1].entries[0]).toMatchObject({ key: 'back', balance: 50 });
    expect(s.months[0].entries[0]).toMatchObject({ key: 'late', balance: 150 });
  });
});

describe('statement window', () => {
  it('opens on the first of the month, counting the current month', () => {
    expect(statementWindowStart('2026-10-09', 1)).toBe('2026-10-01');
    expect(statementWindowStart('2026-10-09', 6)).toBe('2026-05-01');
    expect(statementWindowStart('2026-10-31', 12)).toBe('2025-11-01');
  });

  it('crosses a year boundary', () => {
    expect(statementWindowStart('2026-02-15', 6)).toBe('2025-09-01');
    expect(statementWindowStart('2026-01-01', 2)).toBe('2025-12-01');
    expect(statementWindowStart('2026-12-31', 24)).toBe('2025-01-01');
  });

  it('labels a window start in full', () => {
    expect(fullDayLabel('2026-05-01')).toBe('1 May 2026');
    expect(fullDayLabel('nope')).toBe('nope');
  });
});
