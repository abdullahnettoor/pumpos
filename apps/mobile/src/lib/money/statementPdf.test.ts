import { describe, expect, it } from 'vitest';
import type { RangedPartyLedger } from '@pump/shared';
import { customerPdfParty, statementPdfData, supplierPdfParty } from './statementPdf.js';

const entry = (
  id: string,
  transactionType: string,
  amount: string,
  businessDate: string,
  runningBalance: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  transactionType,
  amount,
  businessDate,
  runningBalance,
  notes: null,
  createdAt: `${businessDate}T06:00:00.000Z`,
  ...extra,
});

const customerLedger: RangedPartyLedger = {
  periodOpeningBalance: '5000.00',
  closingBalance: '9500.00',
  hasEarlier: true,
  entries: [
    entry('a', 'Credit Sale', '8500.00', '2026-10-07', '13500.00', {
      shiftBusinessDate: '2026-10-07',
      shiftSequence: 1,
      productName: 'Diesel',
      quantity: 120,
      unit: 'L',
      vehicleRegistration: 'KL-11-AB-4521',
    }),
    entry('b', 'Collection', '4000.00', '2026-10-18', '9500.00', {
      method: 'UPI',
      reference: 'COL-000042',
    }),
  ],
};

const build = (ledger: RangedPartyLedger, kind: 'customer' | 'supplier' = 'customer') =>
  statementPdfData({
    kind,
    party: { name: 'Acme Transport', lines: [] },
    range: { from: '2026-10-01', to: '2026-10-31' },
    ledger,
    now: new Date('2026-10-10T08:30:00.000Z'),
  });

const cents = (v: string | null) => (v === null ? 0 : Math.round(Number(v) * 100));

describe('statementPdfData', () => {
  it('carries the range, its label and the server opening and closing balances untouched', () => {
    const d = build(customerLedger);
    expect(d).toMatchObject({
      kind: 'customer',
      from: '2026-10-01',
      to: '2026-10-31',
      periodLabel: 'October 2026',
      openingBalance: '5000.00',
      closingBalance: '9500.00',
      generatedAt: '2026-10-10T08:30:00.000Z',
    });
  });

  it('puts a sale in the debit column and a collection in the credit column, oldest first', () => {
    const d = build(customerLedger);
    expect(d.rows).toEqual([
      {
        date: '7 Oct 2026',
        title: 'Credit Sale',
        detail: 'Shift 20261007-1 · 120 L Diesel · KL-11-AB-4521',
        debit: '8500.00',
        credit: null,
        balance: '13500.00',
      },
      {
        date: '18 Oct 2026',
        title: 'Payment received',
        detail: 'UPI · Ref COL-000042',
        debit: null,
        credit: '4000.00',
        balance: '9500.00',
      },
    ]);
  });

  it("prints each row's running balance as the server computed it", () => {
    // Deliberately not what a client sum would give: the PDF must not recompute it.
    const odd: RangedPartyLedger = {
      ...customerLedger,
      entries: customerLedger.entries.map((e) => ({ ...e, runningBalance: '777.00' })),
    };
    expect(build(odd).rows.map((r) => r.balance)).toEqual(['777.00', '777.00']);
  });

  it('opening + debits − credits reconciles to the closing balance', () => {
    const d = build(customerLedger);
    expect(d.totalDebits).toBe('8500.00');
    expect(d.totalCredits).toBe('4000.00');
    expect(cents(d.openingBalance) + cents(d.totalDebits) - cents(d.totalCredits)).toBe(
      cents(d.closingBalance),
    );
  });

  it('adds paise exactly (no float drift in the totals)', () => {
    const d = build({
      periodOpeningBalance: '0.00',
      closingBalance: '0.30',
      hasEarlier: false,
      entries: [
        entry('a', 'Credit Sale', '0.10', '2026-10-01', '0.10'),
        entry('b', 'Credit Sale', '0.20', '2026-10-02', '0.30'),
      ],
    });
    expect(d.totalDebits).toBe('0.30');
  });

  it('treats a supplier Payment as the credit and an advance (negative) balance as is', () => {
    const d = build(
      {
        periodOpeningBalance: '1000.00',
        closingBalance: '-500.00',
        hasEarlier: false,
        entries: [
          entry('p', 'Purchase', '2000.00', '2026-10-03', '3000.00', {
            invoiceNumber: 'INV-77',
            productName: 'HSD',
          }),
          entry('q', 'Payment', '3500.00', '2026-10-09', '-500.00', {
            method: 'BANK',
            fundingAccountName: 'HDFC Current',
          }),
        ],
      },
      'supplier',
    );
    expect(d.rows.map((r) => [r.title, r.debit, r.credit, r.balance])).toEqual([
      ['Purchase · HSD', '2000.00', null, '3000.00'],
      ['Payment made', null, '3500.00', '-500.00'],
    ]);
    expect(d.closingBalance).toBe('-500.00');
    expect(cents(d.openingBalance) + cents(d.totalDebits) - cents(d.totalCredits)).toBe(
      cents(d.closingBalance),
    );
  });

  it('sends a negative Adjustment to the credit column and a positive one to the debit', () => {
    const d = build({
      periodOpeningBalance: '100.00',
      closingBalance: '70.00',
      hasEarlier: false,
      entries: [
        entry('x', 'Adjustment', '-50.00', '2026-10-02', '50.00', { notes: 'Rounding' }),
        entry('y', 'Adjustment', '20.00', '2026-10-03', '70.00'),
      ],
    });
    expect(d.rows.map((r) => [r.debit, r.credit])).toEqual([
      [null, '50.00'],
      ['20.00', null],
    ]);
    expect(d.totalDebits).toBe('20.00');
    expect(d.totalCredits).toBe('50.00');
  });

  it('is an opening balance carried to closing when nothing happened in the range', () => {
    const d = build({
      periodOpeningBalance: '1200.00',
      closingBalance: '1200.00',
      hasEarlier: true,
      entries: [],
    });
    expect(d.rows).toEqual([]);
    expect(d.totalDebits).toBe('0.00');
    expect(d.totalCredits).toBe('0.00');
    expect(d.openingBalance).toBe(d.closingBalance);
  });
});

describe('party details', () => {
  it('names a customer by type and fleet code, GSTIN and phone', () => {
    expect(
      customerPdfParty({
        id: 'c',
        name: 'Acme Transport',
        customerType: 'Fleet',
        fleetCode: 'FL-001',
        phone: '+91 98765 43210',
        metadata: { gstin: ' 29ABCDE1234F1Z5 ' },
      }),
    ).toEqual({
      name: 'Acme Transport',
      lines: ['Fleet · FL-001', 'GSTIN 29ABCDE1234F1Z5', 'Phone +91 98765 43210'],
    });
  });

  it('leaves out what a customer does not have', () => {
    expect(customerPdfParty({ id: 'c', name: 'Walk-in' })).toEqual({ name: 'Walk-in', lines: [] });
  });

  it('names a supplier by trade name, GSTIN, vendor code and phone', () => {
    expect(
      supplierPdfParty({
        id: 's',
        name: 'IOCL Depot',
        phone: '0484 000',
        metadata: { tradeName: 'Indian Oil', gstin: '32AAACI1681G1ZY', vendorCode: 'V-9' },
      }),
    ).toEqual({
      name: 'IOCL Depot',
      lines: ['Indian Oil', 'GSTIN 32AAACI1681G1ZY', 'Code V-9', 'Phone 0484 000'],
    });
  });
});
