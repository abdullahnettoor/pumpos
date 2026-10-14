import { describe, expect, it } from 'vitest';
import {
  canRecordOfficeRecord,
  officeRecordContext,
  officeRecordDating,
  officeRecordDrawerWidth,
  OFFICE_RECORD_KINDS,
} from './kinds.js';

describe('Office Record kinds', () => {
  it('gives every kind one title, the same from every entry point', () => {
    expect(Object.values(OFFICE_RECORD_KINDS).map((k) => k.title)).toEqual([
      'Record expense',
      'Record income',
      'Record collection',
      'Record purchase',
      'Record supplier payment',
    ]);
  });

  it('lets Staff record expenses, income and collections, not purchases or payments', () => {
    expect(canRecordOfficeRecord('expense', 'Staff')).toBe(true);
    expect(canRecordOfficeRecord('income', 'Staff')).toBe(true);
    expect(canRecordOfficeRecord('collection', 'Staff')).toBe(true);
    expect(canRecordOfficeRecord('purchase', 'Staff')).toBe(false);
    expect(canRecordOfficeRecord('supplier-payment', 'Staff')).toBe(false);
    expect(canRecordOfficeRecord('supplier-payment', 'Accountant')).toBe(true);
  });

  it('says how the record is dated', () => {
    expect(officeRecordContext({ kind: 'expense', origin: 'new' })).toBe(
      'Office record · dated by entry date',
    );
    expect(officeRecordContext({ kind: 'expense', origin: 'shifts', shiftName: 'Shift 1' })).toBe(
      'Office record · not part of Shift 1',
    );
    expect(
      officeRecordContext({
        kind: 'purchase',
        origin: 'page',
        purchaseType: 'PRODUCTS',
        date: '2026-10-14',
      }),
    ).toBe('Product purchase · Business Day 14 Oct 2026');
  });

  it('keeps the product-purchase line when opened from Shifts', () => {
    expect(
      officeRecordContext({
        kind: 'purchase',
        origin: 'shifts',
        shiftName: 'Shift 1',
        purchaseType: 'PRODUCTS',
        date: '2026-10-14',
      }),
    ).toBe('Product purchase · Business Day 14 Oct 2026');
    expect(
      officeRecordContext({
        kind: 'purchase',
        origin: 'shifts',
        shiftName: 'Shift 1',
        purchaseType: 'FUEL',
      }),
    ).toBe('Office record · not part of Shift 1');
  });

  it('names the date and where the record shows, per kind', () => {
    expect(officeRecordDating('expense')).toEqual({
      dateLabel: 'Entry date',
      footnote: 'Shown in the Daily cash book and the ledger. Not in the DSSR (office record).',
    });
    expect(officeRecordDating('purchase', 'FUEL').dateLabel).toBe('Invoice date');
    expect(officeRecordDating('purchase', 'PRODUCTS')).toEqual({
      dateLabel: 'Business date',
      footnote: "Shown in the Business Day's purchases and Product stock.",
    });
  });

  it('sizes the drawer for the kind and for the preview beside the form', () => {
    expect(officeRecordDrawerWidth('expense', false)).toBe(560);
    expect(officeRecordDrawerWidth('purchase', false)).toBe(680);
    expect(officeRecordDrawerWidth('collection', true)).toBe(920);
    expect(officeRecordDrawerWidth('purchase', true)).toBe(1040);
  });
});
