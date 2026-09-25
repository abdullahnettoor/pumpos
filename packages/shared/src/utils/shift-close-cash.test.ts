import { describe, expect, it } from 'vitest';
import { computeShiftCloseCash, shiftCloseCashSummaryLines } from './shift-close-cash.js';

describe('shiftCloseCashSummaryLines (#307)', () => {
  it('lines add up to the expected office cash with 3 drawers × ₹1,000 floats', () => {
    const drawers = ['a', 'b', 'c'].map((id) => ({
      attendantId: id,
      duId: `du-${id}`,
      expectedCash: 6000,
      variance: 0,
    }));
    const totals = { openingFloat: 3000, cashSales: 14650, handoverCashDrops: 500, drawers };
    const closeCash = computeShiftCloseCash(totals, 0, [
      { attendantId: 'a', duId: 'du-a', amount: 500 },
      { amount: 300 },
    ]);
    const l = shiftCloseCashSummaryLines(totals, closeCash);

    expect(l.openingFloats).toBe(3000);
    expect(l.unassignedCloseDrops).toBe(300);
    expect(l.openingFloats + l.cashDeclared - l.handoverDrops - l.unassignedCloseDrops).toBe(
      l.expectedOfficeCash,
    );
    expect(l.expectedOfficeCash).toBe(16850);
  });
});
