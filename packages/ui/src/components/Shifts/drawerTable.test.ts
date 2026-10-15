import { describe, expect, it } from 'vitest';
import { cellText, totalTexts } from '../../pump-ds/index.js';
import { drawerColumns, drawerRows, drawerTotalRow } from './DrawerReconciliationTable.js';

/**
 * The Drawers table's one definition (#534), as a PDF reads it (#595): every
 * cell and the total row as plain text, the same words and figures the screen
 * shows.
 */
const drawer = (id: string, du: string, handed: number | null, variance: number | null) => ({
  attendantId: id,
  attendantName: id === 'u1' ? 'Ravi' : 'Suresh',
  duId: du,
  duName: du.toUpperCase(),
  openingFloat: 1000,
  cashSales: handed == null ? null : 4000,
  cashDrops: 200,
  closeCashDrops: 0,
  expectedCash: handed == null ? null : 4800,
  cashHandedOver: handed,
  variance,
});

describe('the Drawers table as plain text (#534, for the #595 PDF)', () => {
  const columns = drawerColumns();

  it('reads each cell as the screen does: a status word, a blank as —, a signed variance', () => {
    const rows = drawerRows([drawer('u1', 'du1', 4680, -120), drawer('u2', 'du2', null, null)]);
    expect(columns.map((c) => cellText(c, rows[0]))).toEqual([
      'DU1 · Ravi',
      'Recorded',
      '₹1,000.00',
      '₹4,000.00',
      '₹200.00',
      '₹4,800.00',
      '₹4,680.00',
      '−₹120.00',
    ]);
    expect(columns.map((c) => cellText(c, rows[1]))).toEqual([
      'DU2 · Suresh',
      'Pending',
      '₹1,000.00',
      '—',
      '₹200.00',
      '—',
      '—',
      '—',
    ]);
  });

  it('totals the handed-over Drawers, says what it leaves out, and words the variance', () => {
    const rows = drawerRows([drawer('u1', 'du1', 4680, -120), drawer('u2', 'du2', null, null)]);
    expect(totalTexts(columns, rows, drawerTotalRow(rows))?.cells).toEqual([
      'Total excl. DU2, not handed over',
      '',
      '₹1,000.00',
      '₹4,000.00',
      '₹200.00',
      '₹4,800.00',
      '₹4,680.00',
      '−₹120.00',
    ]);
    const balanced = drawerRows([drawer('u1', 'du1', 4800, 0.004)]);
    expect(totalTexts(columns, balanced, drawerTotalRow(balanced))?.cells.at(-1)).toBe('Balanced');
  });

  it('prints no variance total while no Drawer has handed over', () => {
    const rows = drawerRows([drawer('u2', 'du2', null, null)]);
    expect(totalTexts(columns, rows, drawerTotalRow(rows))?.cells.at(-1)).toBe('—');
  });
});
