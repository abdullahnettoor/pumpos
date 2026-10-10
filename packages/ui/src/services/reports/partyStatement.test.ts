import { describe, expect, it } from 'vitest';
import type { RangedPartyLedger } from '@pump/shared';
import {
  customerStatementParty,
  dateOf,
  partyStatementDoc,
  statementFilePrefix,
  supplierStatementParty,
  type PartyKind,
} from './partyStatement.js';
import { ledgerFileName, fileSlug } from './ledgerFileName.js';

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

const build = (ledger: RangedPartyLedger, kind: PartyKind = 'customer') =>
  partyStatementDoc({
    kind,
    party: { name: 'Acme Transport', lines: ['Fleet · FL-001'] },
    range: { from: '2026-10-01', to: '2026-10-31' },
    periodLabel: 'October 2026',
    ledger,
    generatedAt: new Date('2026-10-10T08:30:00.000Z'),
  });

describe('partyStatementDoc', () => {
  it('carries the party, the range label and the server opening balance', () => {
    expect(build(customerLedger)).toMatchObject({
      title: 'CUSTOMER STATEMENT',
      entityName: 'Acme Transport',
      periodLabel: 'October 2026',
      partyLines: ['Fleet · FL-001'],
      partyAccount: true,
      opening: 5000,
      totals: { debit: 8500, credit: 4000, balance: 9500 },
      debitLabel: 'Sales',
      creditLabel: 'Received',
      generatedAt: '2026-10-10T08:30:00.000Z',
    });
  });

  it('puts a sale in the debit column and a collection in the credit column, oldest first', () => {
    expect(build(customerLedger).rows).toEqual([
      {
        dateLabel: '7 Oct 2026',
        particulars: 'Credit Sale',
        detail: 'Shift 20261007-1 · 120 L Diesel · KL-11-AB-4521',
        debit: 8500,
        credit: 0,
        balance: 13500,
      },
      {
        dateLabel: '18 Oct 2026',
        particulars: 'Payment received',
        detail: 'UPI · Ref COL-000042',
        debit: 0,
        credit: 4000,
        balance: 9500,
      },
    ]);
  });

  it("prints each row's running balance as the server computed it", () => {
    // Deliberately not what a client sum would give: the PDF must not recompute it.
    const odd: RangedPartyLedger = {
      ...customerLedger,
      entries: customerLedger.entries.map((e) => ({ ...e, runningBalance: '777.00' })),
    };
    expect(build(odd).rows.map((r) => r.balance)).toEqual([777, 777]);
  });

  it('opening + debits - credits reconciles to the closing balance', () => {
    const d = build(customerLedger);
    expect(d.opening! + d.totals.debit - d.totals.credit).toBe(d.totals.balance);
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
    expect(d.totals.debit).toBe(0.3);
  });

  it('treats a supplier Payment as the credit; a negative balance is an advance', () => {
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
    expect(d.title).toBe('SUPPLIER STATEMENT');
    expect(d.rows.map((r) => [r.particulars, r.debit, r.credit, r.balance])).toEqual([
      ['Purchase · HSD', 2000, 0, 3000],
      ['Payment made', 0, 3500, -500],
    ]);
    expect(d.totals.balance).toBe(-500);
    expect(d.closing).toEqual({ note: 'Advance' });
  });

  it('names an advance the same way for a customer who has paid ahead', () => {
    const d = build({ ...customerLedger, closingBalance: '-1200.00' });
    expect(d.closing).toEqual({ note: 'Advance' });
  });

  it('names what a positive balance means for each kind, and a zero one', () => {
    expect(build(customerLedger).closing).toEqual({ note: 'Due from customer' });
    expect(build({ ...customerLedger, closingBalance: '9500.00' }, 'supplier').closing).toEqual({
      note: 'Payable to supplier',
    });
    expect(build({ ...customerLedger, closingBalance: '0.00' }).closing).toEqual({
      note: 'Settled',
    });
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
      [0, 50],
      [20, 0],
    ]);
    expect(d.totals).toMatchObject({ debit: 20, credit: 50 });
  });

  it('is an opening balance carried to closing when nothing happened in the range', () => {
    const d = build({
      periodOpeningBalance: '1200.00',
      closingBalance: '1200.00',
      hasEarlier: true,
      entries: [],
    });
    expect(d.rows).toEqual([]);
    expect(d.totals).toEqual({ debit: 0, credit: 0, balance: 1200 });
    expect(d.opening).toBe(1200);
  });
});

describe('party details', () => {
  it('names a customer by type and fleet code, GSTIN and phone', () => {
    expect(
      customerStatementParty({
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
    expect(customerStatementParty({ name: 'Walk-in' })).toEqual({ name: 'Walk-in', lines: [] });
  });

  it('names a supplier by trade name, GSTIN, vendor code and phone', () => {
    expect(
      supplierStatementParty({
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

describe('ledger file names (one helper for the desktop ledger and the statements)', () => {
  it('slugs the name to ASCII words and carries the range', () => {
    const range = { from: '2026-10-01', to: '2026-10-31' };
    expect(ledgerFileName('Ledger', 'Acme Transport', range)).toBe(
      'Ledger_Acme_Transport_2026-10-01_2026-10-31',
    );
    expect(
      ledgerFileName(statementFilePrefix('supplier'), 'IOCL — Depot #4', range, 'Supplier'),
    ).toBe('Supplier_Statement_IOCL_Depot_4_2026-10-01_2026-10-31');
  });

  it('falls back when the name has nothing ASCII', () => {
    expect(fileSlug('गणेश', 'Customer')).toBe('Customer');
    expect(ledgerFileName('Customer_Statement', '', { from: 'a', to: 'b' }, 'Customer')).toBe(
      'Customer_Statement_Customer_a_b',
    );
  });
});

describe('dateOf', () => {
  it('prefers the row\'s own Business / Entry Date', () => {
    expect(dateOf({ businessDate: '2026-10-07', createdAt: '2026-10-09T20:00:00Z' })).toBe(
      '2026-10-07',
    );
  });

  it('falls back to the Shift Business Date, then to the station-timezone date of createdAt', () => {
    expect(dateOf({ shiftBusinessDate: '2026-10-06', createdAt: '2026-10-09T20:00:00Z' })).toBe(
      '2026-10-06',
    );
    // 20:00 UTC on the 9th is 01:30 on the 10th in Asia/Kolkata: not the UTC slice.
    expect(dateOf({ createdAt: '2026-10-09T20:00:00Z' }, 'Asia/Kolkata')).toBe('2026-10-10');
    expect(dateOf({ createdAt: '2026-10-09T20:00:00Z' }, 'UTC')).toBe('2026-10-09');
  });

  it('is empty for a row with no date at all', () => {
    expect(dateOf({})).toBe('');
    expect(dateOf({ createdAt: 'not a date' })).toBe('');
  });
});
