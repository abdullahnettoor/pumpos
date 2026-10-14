import { describe, expect, it } from 'vitest';
import { buildOfficeRecordPreview, type OfficeRecordDraft } from './preview.js';

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
});
