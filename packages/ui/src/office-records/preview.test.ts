import { describe, expect, it } from 'vitest';
import {
  advanceText,
  buildOfficeRecordPreview,
  collectionHint,
  partPaymentText,
  payNowDateFor,
  type OfficeRecordDraft,
} from './preview.js';

const TODAY = '2026-10-14';
const HDFC = { id: 'hdfc', name: 'HDFC Current', balance: 10_000 };

const draft = (over: Partial<OfficeRecordDraft>): OfficeRecordDraft => ({
  kind: 'expense',
  date: TODAY,
  today: TODAY,
  amount: 4200,
  what: 'Electricity',
  matchId: 'cat-electricity',
  account: HDFC,
  party: null,
  ...over,
});

describe('buildOfficeRecordPreview', () => {
  it('moves the funding account out for an expense and reports no issues', () => {
    const p = buildOfficeRecordPreview(draft({}), []);
    expect(p.mainMove).toEqual({ label: 'HDFC Current', before: 10_000, after: 5800 });
    expect(p.flag).toEqual({ label: 'No issues', tone: 'success' });
    expect(p.lines).toEqual([{ label: 'Expense · Electricity', amount: 4200 }]);
  });

  it('flags a possible repeat: same date, amount and category already recorded', () => {
    const p = buildOfficeRecordPreview(draft({}), [
      { date: TODAY, amount: 4200, matchId: 'cat-electricity' },
    ]);
    expect(p.flag).toEqual({ label: 'Possible repeat', tone: 'warning' });
    expect(p.checks.map((c) => c.code)).toEqual(['repeat']);
  });

  it('does not call a different category or another day a repeat', () => {
    const p = buildOfficeRecordPreview(draft({}), [
      { date: TODAY, amount: 4200, matchId: 'cat-tea' },
      { date: '2026-10-13', amount: 4200, matchId: 'cat-electricity' },
    ]);
    expect(p.flag.label).toBe('No issues');
  });

  it('flags an outflow that takes the funding account below zero', () => {
    const p = buildOfficeRecordPreview(draft({ amount: 12_000 }), []);
    expect(p.flag).toEqual({ label: 'Goes negative', tone: 'danger' });
    expect(p.mainMove).toEqual({ label: 'HDFC Current', before: 10_000, after: -2000 });
  });

  it('never warns about a balance it does not know', () => {
    const p = buildOfficeRecordPreview(
      draft({ amount: 12_000, account: { id: 'hdfc', name: 'HDFC Current', balance: null } }),
      [],
    );
    expect(p.flag.label).toBe('No issues');
    expect(p.mainMove).toBeNull();
  });

  it('adds money to the account for income and splits the GST it includes', () => {
    const p = buildOfficeRecordPreview(
      draft({ kind: 'income', amount: 1180, what: 'Commission', gstRate: 18 }),
      [],
    );
    expect(p.mainMove).toEqual({ label: 'HDFC Current', before: 10_000, after: 11_180 });
    expect(p.lines).toEqual([
      { label: 'Income · Commission', amount: 1180 },
      { label: 'of which GST 18% (output)', amount: 180 },
    ]);
  });

  it('notes a back-dated office record without warning', () => {
    const p = buildOfficeRecordPreview(draft({ date: '2026-10-12' }), []);
    expect(p.flag.label).toBe('No issues');
    expect(p.checks).toEqual([expect.objectContaining({ code: 'backdated', tone: 'info' })]);
  });

  it('reduces what the customer owes on a collection and flags an advance', () => {
    const p = buildOfficeRecordPreview(
      draft({
        kind: 'collection',
        amount: 6000,
        what: 'Kaveri Travels',
        party: { id: 'c4', name: 'Kaveri Travels', balance: 5000 },
      }),
      [],
    );
    expect(p.moves).toContainEqual({ label: 'Kaveri Travels due', before: 5000, after: -1000 });
    expect(p.flag).toEqual({ label: 'Advance', tone: 'warning' });
  });

  it('posts a terminal collection to the clearing line, not an account', () => {
    const p = buildOfficeRecordPreview(
      draft({
        kind: 'collection',
        account: null,
        terminal: 'Pine POS',
        party: { id: 'c1', name: 'Balaji', balance: 9000 },
      }),
      [],
    );
    expect(p.lines).toEqual([{ label: 'Pine POS clearing', amount: 4200 }]);
    expect(p.mainMove).toEqual({ label: 'Balaji due', before: 9000, after: 4800 });
  });

  it('raises what is owed for a purchase and lowers it again by the payment made now', () => {
    const p = buildOfficeRecordPreview(
      draft({
        kind: 'purchase',
        amount: 10_000,
        what: 'BPCL',
        account: HDFC,
        party: { id: 's1', name: 'BPCL', balance: 50_000 },
        purchase: { type: 'FUEL', payNow: 4000, stockLines: [] },
      }),
      [],
    );
    expect(p.moves).toEqual([
      { label: 'BPCL owed', before: 50_000, after: 56_000 },
      { label: 'HDFC Current', before: 10_000, after: 6000 },
    ]);
    expect(p.checks.map((c) => c.code)).toEqual(['no-stock', 'pay-now']);
  });

  it('counts several warnings in one chip', () => {
    const p = buildOfficeRecordPreview(draft({ amount: 12_000 }), [
      { date: TODAY, amount: 12_000, matchId: 'cat-electricity' },
    ]);
    expect(p.flag).toEqual({ label: '2 checks', tone: 'danger' });
  });

  it('says "Dated <date>, before today" for an earlier entry date', () => {
    const p = buildOfficeRecordPreview(draft({ date: '2026-10-12' }), []);
    expect(p.checks[0].text).toMatch(/^Dated .+, before today: /);
    expect(p.checks[0].text).not.toMatch(/back-?dated/i);
  });

  describe('purchase dates', () => {
    const purchase = (over: Partial<OfficeRecordDraft>, payDate?: string) =>
      draft({
        kind: 'purchase',
        amount: 10_000,
        what: 'BPCL',
        account: HDFC,
        party: null,
        purchase: { type: 'FUEL', payNow: payDate ? 4000 : null, payDate, stockLines: [] },
        ...over,
      });

    it('notes a fuel invoice dated before today', () => {
      const p = buildOfficeRecordPreview(purchase({ date: '2026-10-10' }), []);
      expect(p.checks.map((c) => c.code)).toContain('backdated');
      expect(p.flag.label).toBe('No issues');
    });

    it("compares a product purchase with the current Business Day, not today's date", () => {
      const before = { businessDate: '2026-10-13', today: TODAY };
      const product = (date: string) =>
        purchase({
          ...before,
          date,
          purchase: { type: 'PRODUCTS', payNow: null, stockLines: [] },
        });
      expect(
        buildOfficeRecordPreview(product('2026-10-13'), []).checks.map((c) => c.code),
      ).not.toContain('backdated');
      expect(
        buildOfficeRecordPreview(product('2026-10-12'), []).checks.map((c) => c.code),
      ).toContain('backdated');
    });

    it("dates the pay-now note by the payment's own date", () => {
      const p = buildOfficeRecordPreview(purchase({}, '2026-10-11'), []);
      const note = p.checks.find((c) => c.code === 'pay-now')!;
      expect(note.text).toMatch(/Supplier payment of ₹4,000\.00, dated .+, before today/);
    });
  });
});

describe('amount hints shared with the forms', () => {
  it('says how much of a collection becomes an advance', () => {
    expect(advanceText(5000, 6000)).toBe(
      'Collects more than is due: ₹1,000.00 becomes an advance.',
    );
    expect(advanceText(5000, 4000)).toBeNull();
    expect(advanceText(null, 4000)).toBeNull();
  });

  it('says what stays owed after a part payment', () => {
    expect(partPaymentText(5000, 4000)).toBe('Part payment: ₹1,000.00 stays owed.');
    expect(partPaymentText(5000, 5000)).toBeNull();
    expect(partPaymentText(5000, null)).toBeNull();
  });

  it("shows a collection's due before and after it", () => {
    expect(collectionHint(5000, 2000)).toBe('₹5,000.00 due → ₹3,000.00 after this.');
    expect(collectionHint(5000, null)).toBe('₹5,000.00 due.');
    expect(collectionHint(5000, 0)).toBe('₹5,000.00 due.');
    expect(collectionHint(5000, 6000)).toBe(advanceText(5000, 6000));
    expect(collectionHint(null, 2000)).toBeUndefined();
  });
});

describe('payNowDateFor: the pay-now payment date before the operator picks one', () => {
  // 23:00 UTC on 14 Oct is 04:30 on 15 Oct in Kolkata: before a 06:00 Day Start,
  // so the Business Date is still the 14th while the calendar says the 15th.
  const clock = { today: '2026-10-15', businessDate: '2026-10-14' };

  it('is the purchase date for a fuel purchase (its invoice date)', () => {
    expect(payNowDateFor('2026-10-14', 'FUEL', clock)).toBe('2026-10-14');
    expect(payNowDateFor('2026-10-10', 'FUEL', clock)).toBe('2026-10-10');
  });

  it("is today's calendar date for a product purchase on the current Business Day", () => {
    expect(payNowDateFor('2026-10-14', 'PRODUCTS', clock)).toBe('2026-10-15');
  });

  it('is the purchase date for a product purchase on an earlier Business Day', () => {
    expect(payNowDateFor('2026-10-12', 'PRODUCTS', clock)).toBe('2026-10-12');
  });

  it('stays empty while the purchase has no date', () => {
    expect(payNowDateFor('', 'PRODUCTS', { today: '2026-10-15', businessDate: '' })).toBe('');
  });
});
