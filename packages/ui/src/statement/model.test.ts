import { describe, expect, it } from 'vitest';
import { buildLedgerStatement, placeDate, type LedgerStatementEntry } from './model.js';
import { sourceLabel } from './sources.js';

const entry = (
  over: Partial<LedgerStatementEntry> & { id: string; amount: number },
): LedgerStatementEntry => ({
  basis: 'entry',
  source: 'ADJUSTMENT',
  date: '2026-10-01',
  ...over,
});

describe('buildLedgerStatement: running balance', () => {
  it('runs from the opening balance, oldest first, and closes on the last balance', () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'b', date: '2026-10-03', amount: -400 }),
        entry({ id: 'a', date: '2026-10-01', amount: 1000 }),
        entry({ id: 'c', date: '2026-10-05', amount: 250.5 }),
      ],
      { kind: 'account', opening: 100 },
    );
    expect(s.rows.map((r) => [r.id, r.balance])).toEqual([
      ['a', 1100],
      ['b', 700],
      ['c', 950.5],
    ]);
    expect(s.opening).toBe(100);
    expect(s.closing).toBe(950.5);
  });

  it('adds in paise, so ten 0.10 entries close on exactly 1.00', () => {
    const rows = Array.from({ length: 10 }, (_, i) => entry({ id: `r${i}`, amount: 0.1 }));
    const s = buildLedgerStatement(rows, { kind: 'account', opening: 0 });
    expect(s.closing).toBe(1);
    expect(s.totals.debit).toBe(1);
  });

  it('keeps same-date rows in the order they were recorded, then as given', () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'late', at: '2026-10-01T10:00:00Z', amount: 1 }),
        entry({ id: 'early', at: '2026-10-01T04:00:00Z', amount: 1 }),
        entry({ id: 'x', amount: 1 }),
        entry({ id: 'y', amount: 1 }),
      ],
      { kind: 'account' },
    );
    expect(s.rows.map((r) => r.id)).toEqual(['x', 'y', 'early', 'late']);
  });

  it("prints the server's running balances and closing when they add up", () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'a', amount: 100, balance: '600.00' }),
        entry({ id: 'b', amount: -50, balance: '550.00' }),
      ],
      { kind: 'customer', opening: 500, closing: '550.00' },
    );
    expect(s.rows.map((r) => r.balance)).toEqual([600, 550]);
    expect(s.closing).toBe(550);
    expect(s.reconciled).toBe(true);
  });

  it("works the balances out from the entries, and says so, when the server's don't add up", () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'a', amount: 100, balance: '777.00' }),
        entry({ id: 'b', amount: 100, balance: '888.00' }),
      ],
      { kind: 'customer', opening: 0, closing: '999.00' },
    );
    // Never the server's 777 / 888 / 999 beside rows that add up to 200.
    expect(s.rows.map((r) => r.balance)).toEqual([100, 200]);
    expect(s.closing).toBe(200);
    expect(s.reconciled).toBe(false);
  });

  it("checks the server's closing even when the rows carry no balance", () => {
    const s = buildLedgerStatement([entry({ id: 'a', amount: 100 })], {
      kind: 'account',
      opening: 50,
      closing: 140,
    });
    expect(s.closing).toBe(150);
    expect(s.reconciled).toBe(false);
  });

  it("checks the server's money in / out against the column totals", () => {
    const entries = [entry({ id: 'a', amount: 300 }), entry({ id: 'b', amount: -120 })];
    const ok = buildLedgerStatement(entries, {
      kind: 'account',
      opening: 0,
      closing: 180,
      totals: { debit: 300, credit: 120 },
    });
    expect(ok.reconciled).toBe(true);
    const off = buildLedgerStatement(entries, {
      kind: 'account',
      opening: 0,
      closing: 180,
      totals: { debit: 300, credit: 100 },
    });
    expect(off.reconciled).toBe(false);
  });

  it('computes every balance itself when a row lacks the server figure', () => {
    const s = buildLedgerStatement(
      [entry({ id: 'a', amount: 100, balance: '100.00' }), entry({ id: 'b', amount: 100 })],
      { kind: 'customer', opening: 0 },
    );
    expect(s.rows.map((r) => r.balance)).toEqual([100, 200]);
    expect(s.reconciled).toBe(true);
  });
});

describe('buildLedgerStatement: opening and closing', () => {
  it('without an opening balance the statement starts at zero and shows no opening line', () => {
    const s = buildLedgerStatement([entry({ id: 'a', amount: 50 })], { kind: 'customer' });
    expect(s.opening).toBeNull();
    expect(s.closing).toBe(50);
  });

  it('an imported Opening Balance first in an all-time statement becomes the opening line', () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'sale', source: 'Credit Sale', date: '2026-10-02', amount: 300 }),
        entry({ id: 'ob', source: 'Opening Balance', date: '2026-10-01', amount: 1500 }),
      ],
      { kind: 'customer' },
    );
    expect(s.opening).toBe(1500);
    expect(s.rows.map((r) => [r.id, r.balance])).toEqual([['sale', 1800]]);
    expect(s.totals).toEqual({ debit: 300, credit: 0 });
    expect(s.closing).toBe(1800);
  });

  it('an Opening Balance entry stays a row when the statement already has an opening', () => {
    const s = buildLedgerStatement([entry({ id: 'ob', source: 'OPENING', amount: 1500 })], {
      kind: 'account',
      opening: 0,
    });
    expect(s.opening).toBe(0);
    expect(s.rows.map((r) => r.id)).toEqual(['ob']);
  });

  it('an empty period closes on its opening balance', () => {
    const s = buildLedgerStatement([], { kind: 'account', opening: 1234.5 });
    expect(s.rows).toEqual([]);
    expect(s.closing).toBe(1234.5);
    expect(s.totals).toEqual({ debit: 0, credit: 0 });
  });

  it('opening + debits − credits = closing on a debit-side account', () => {
    const s = buildLedgerStatement(
      [entry({ id: 'a', amount: 800 }), entry({ id: 'b', amount: -300 })],
      {
        kind: 'customer',
        opening: 200,
      },
    );
    expect(s.opening! + s.totals.debit - s.totals.credit).toBe(s.closing);
  });

  it('opening + credits − debits = closing on a credit-side account', () => {
    const s = buildLedgerStatement(
      [entry({ id: 'a', amount: 800 }), entry({ id: 'b', amount: -300 })],
      {
        kind: 'supplier',
        opening: 200,
      },
    );
    expect(s.opening! + s.totals.credit - s.totals.debit).toBe(s.closing);
  });
});

describe('buildLedgerStatement: signs and sides', () => {
  it('customer (receivable): a sale is a Debit, a collection a Credit', () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'sale', source: 'Credit Sale', amount: 500 }),
        entry({ id: 'col', source: 'Collection', amount: -200 }),
      ],
      { kind: 'customer' },
    );
    expect(s.rows.map((r) => [r.id, r.debit, r.credit])).toEqual([
      ['sale', 500, null],
      ['col', null, 200],
    ]);
  });

  it('supplier (payable): a purchase is a Credit, a payment a Debit', () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'buy', source: 'Purchase', amount: 900 }),
        entry({ id: 'pay', source: 'Payment', amount: -900 }),
      ],
      { kind: 'supplier' },
    );
    expect(s.rows.map((r) => [r.id, r.debit, r.credit])).toEqual([
      ['buy', null, 900],
      ['pay', 900, null],
    ]);
  });

  it('cash / bank account: a receipt is a Debit, a payment a Credit', () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'in', source: 'COLLECTION', amount: 300 }),
        entry({ id: 'out', source: 'EXPENSE', amount: -120 }),
      ],
      { kind: 'account' },
    );
    expect(s.rows.map((r) => [r.id, r.debit, r.credit])).toEqual([
      ['in', 300, null],
      ['out', null, 120],
    ]);
  });

  it('a balance can go below zero (an advance, an overdraft) and stays signed', () => {
    const s = buildLedgerStatement([entry({ id: 'a', amount: -3000 })], {
      kind: 'customer',
      opening: 1000,
    });
    expect(s.rows[0].balance).toBe(-2000);
    expect(s.closing).toBe(-2000);
  });

  it('words a row from the one source-label map unless the entry names itself', () => {
    const s = buildLedgerStatement(
      [
        entry({ id: 'a', source: 'SALE_CASH', amount: 1 }),
        entry({ id: 'b', source: 'Purchase', particulars: 'Purchase · Diesel', amount: 1 }),
      ],
      { kind: 'account' },
    );
    expect(s.rows.map((r) => r.particulars)).toEqual(['Shift cash', 'Purchase · Diesel']);
  });
});

describe('placeDate: Entry Date vs Business Date (ADR 0005)', () => {
  // 03:00 IST on 15 Oct 2026 = 21:30 UTC on 14 Oct.
  const at = '2026-10-14T21:30:00.000Z';
  const clock = { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' };

  it('keeps the calendar date the server gave', () => {
    expect(placeDate({ basis: 'business', date: '2026-10-09', at }, clock)).toBe('2026-10-09');
  });

  it('resolves a timestamp given as the date on the station clock, never slicing it in UTC', () => {
    expect(placeDate({ basis: 'entry', date: at }, clock)).toBe('2026-10-15');
    expect(placeDate({ basis: 'business', date: at }, clock)).toBe('2026-10-14');
  });

  it('a sale before Day Start lands on the previous Business Date', () => {
    expect(placeDate({ basis: 'business', at }, clock)).toBe('2026-10-14');
  });

  it('an office record at the same instant lands on its calendar Entry Date', () => {
    expect(placeDate({ basis: 'entry', at }, clock)).toBe('2026-10-15');
  });

  it('never takes the UTC slice of the instant', () => {
    expect(placeDate({ basis: 'entry', at }, { timeZone: 'Asia/Kolkata' })).not.toBe(
      at.slice(0, 10),
    );
  });

  it('is empty without a date or an instant', () => {
    expect(placeDate({ basis: 'entry' }, clock)).toBe('');
  });

  it('a statement row carries its placed date and basis', () => {
    const s = buildLedgerStatement(
      [
        { id: 'sale', basis: 'business', at, source: 'Credit Sale', amount: 10 },
        { id: 'col', basis: 'entry', at, source: 'Collection', amount: -10 },
      ],
      { kind: 'customer', clock },
    );
    expect(s.rows.map((r) => [r.id, r.date, r.basis])).toEqual([
      ['sale', '2026-10-14', 'business'],
      ['col', '2026-10-15', 'entry'],
    ]);
  });
});

describe('sourceLabel: one map for ledger sources and party transaction types', () => {
  it('words money-ledger sources and party types', () => {
    expect(sourceLabel('SALE_CARD')).toBe('Card/UPI batch');
    expect(sourceLabel('SUPPLIER_PAYMENT')).toBe('Supplier payment');
    expect(sourceLabel('Collection')).toBe('Payment received');
    expect(sourceLabel('Payment')).toBe('Payment made');
    expect(sourceLabel('Opening Balance')).toBe('Opening balance');
  });

  it('falls back to the raw key, then a dash', () => {
    expect(sourceLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(sourceLabel(null)).toBe('—');
  });
});
