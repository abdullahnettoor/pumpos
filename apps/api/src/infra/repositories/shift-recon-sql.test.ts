import { describe, expect, it } from 'vitest';
import { computeShiftCloseCash } from '@pump/shared';
import { assembleReconTotals } from './shift-recon-sql.js';

/**
 * #287 worked example, from raw Handover rows through the real reader: the
 * 34,800 ledger figure is derived here, not typed in.
 * A: float 1,000, sales 20,000, drop 10,000 → should hold 11,000, declares 10,800.
 * B: float 1,000, sales 15,000 → should hold 16,000, declares 16,000.
 * Office counts 26,700.
 */
describe('assembleReconTotals + computeShiftCloseCash (#287 worked example)', () => {
  const raw = {
    opening_float: 2000,
    handover_float: 2000,
    handover_cash_drops: 10000,
    handover_cash: 10800 + 16000,
    handover_count: 2,
    sellers: [],
    drawers: [
      {
        attendantId: 'a',
        attendantName: 'A',
        duId: 'du1',
        duName: 'DU-1',
        openingFloat: 1000,
        cashDrops: 10000,
        expectedCash: 11000,
        cashHandedOver: 10800,
        variance: -200,
        handedOver: true,
      },
      {
        attendantId: 'b',
        attendantName: 'B',
        duId: 'du2',
        duName: 'DU-2',
        openingFloat: 1000,
        cashDrops: 0,
        expectedCash: 16000,
        cashHandedOver: 16000,
        variance: 0,
        handedOver: true,
      },
    ],
  };

  it('derives ledger cash sales 34,800, attendant −200, office −100', () => {
    const totals = assembleReconTotals(raw);
    expect(totals.cashSales).toBe(34800);
    const close = computeShiftCloseCash(totals, 26700);
    expect(close.cashSales).toBe(34800);
    expect(close.expectedDrawerCash).toBe(26800);
    expect(close.attendantVariance).toBe(-200);
    expect(close.cashVariance).toBe(-100);
  });
});
