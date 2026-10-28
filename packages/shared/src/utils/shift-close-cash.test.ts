import { describe, expect, it } from 'vite-plus/test';
import {
  buildCloseCashSummary,
  isBalancedVariance,
  VARIANCE_EPSILON,
  type ShiftCloseCashSummaryLines,
} from './shift-close-cash.js';

/** The displayed summary, top to bottom, as the wizard renders it. */
const displayedTotal = (l: ShiftCloseCashSummaryLines) =>
  l.openingFloats + l.cashDeclared - l.handoverDrops - l.unassignedCloseDrops;

/** A Drawer consistent with its own figures:
 *  expected = float + cash sales − handover drops; variance = handed − expected. */
const drawer = (id: string, cashSales: number, drops: number, handed: number) => {
  const expectedCash = 1000 + cashSales - drops;
  return {
    attendantId: id,
    duId: `du-${id}`,
    openingFloat: 1000,
    cashSales,
    cashDrops: drops,
    expectedCash,
    cashHandedOver: handed,
    variance: handed - expectedCash,
    closeCashDrops: 0,
  };
};

describe('buildCloseCashSummary (#307)', () => {
  // 3 Drawers × ₹1,000 float. Declared cash sales = handed + drops − float.
  const drawers = [
    drawer('a', 5000, 500, 5500), // balanced
    drawer('b', 5000, 0, 6000), // balanced
    drawer('c', 4650, 0, 5600), // ₹50 short
  ];
  const recon = {
    openingFloat: '3000.00',
    cashSales: '14600.00', // Σ (handed + drops − float)
    handoverCashDrops: '500.00',
    drawers,
  };
  const closeDrops = [
    { attendantId: 'b', duId: 'du-b', amount: 400 }, // named
    { attendantId: null, duId: null, amount: 300 }, // unassigned
  ];

  it('shows Σ floats and lines that add up to the expected office cash', () => {
    const { lines, closeCash } = buildCloseCashSummary({
      recon,
      staffAssignments: [],
      closeDrops,
      closingCash: 16800,
      cashHandedOver: null,
    });

    expect(lines.openingFloats).toBe(3000);
    expect(lines.cashDeclared).toBe(14600);
    expect(lines.handoverDrops).toBe(500);
    expect(displayedTotal(lines)).toBe(lines.expectedOfficeCash);
    expect(lines.expectedOfficeCash).toBe(16800);
    expect(closeCash?.expectedDrawerCash).toBe(lines.expectedOfficeCash);
  });

  it('keeps the named drop out of the (−) line and on its Drawer', () => {
    const { lines, closeCash } = buildCloseCashSummary({
      recon,
      staffAssignments: [],
      closeDrops,
      closingCash: 0,
      cashHandedOver: null,
    });

    expect(lines.unassignedCloseDrops).toBe(300);
    expect(closeCash?.drawerCloseCashDrops).toBe(400);
    const b = closeCash?.drawers.find((d) => d.attendantId === 'b');
    expect(b?.closeCashDrops).toBe(400);
    expect(b?.expectedCash).toBe(5600);
  });

  it('sums floats from staff assignments before the server recon loads', () => {
    const staffAssignments = [
      { openingFloat: '1000.00' },
      { openingFloat: 1000 },
      { openingFloat: '1000' },
    ];
    const before = buildCloseCashSummary({
      recon: null,
      staffAssignments,
      closeDrops: [],
      closingCash: 0,
      cashHandedOver: null,
    });
    expect(before.closeCash).toBeNull();
    expect(before.lines.openingFloats).toBe(3000);
    expect(before.lines.expectedOfficeCash).toBe(3000);
    expect(displayedTotal(before.lines)).toBe(before.lines.expectedOfficeCash);

    const after = buildCloseCashSummary({
      recon: null,
      staffAssignments,
      closeDrops: [],
      closingCash: 0,
      cashHandedOver: 17100, // Σ declared, floats included
    });
    expect(after.lines.cashDeclared).toBe(14100);
    expect(displayedTotal(after.lines)).toBe(17100);
  });
});

describe('isBalancedVariance: the one balanced rule for money (#556)', () => {
  it('is half a paisa', () => {
    expect(VARIANCE_EPSILON).toBe(0.005);
  });
  it('reads a tiny variance (under half a paisa) as balanced, either way', () => {
    expect(isBalancedVariance(0)).toBe(true);
    expect(isBalancedVariance(0.004)).toBe(true);
    expect(isBalancedVariance(-0.004)).toBe(true);
    expect(isBalancedVariance(0.1 + 0.2 - 0.3)).toBe(true);
  });
  it('reads a paisa or a rupee as off', () => {
    expect(isBalancedVariance(0.005)).toBe(false);
    expect(isBalancedVariance(0.01)).toBe(false);
    expect(isBalancedVariance(-0.01)).toBe(false);
    expect(isBalancedVariance(1)).toBe(false);
    expect(isBalancedVariance(-1)).toBe(false);
  });
});
