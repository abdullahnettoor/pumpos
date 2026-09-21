import { describe, expect, it } from 'vitest';
import { schema } from '@pump/db';
import { projectShiftSummary, type ProjectableShift } from './shift-summary-projection.js';

/**
 * #224: the Closed & Locked Shifts history reads `templateName`, `closedByName`
 * and `expectedCash` straight off the stored snapshot. Test-era rows predate
 * those fields and are deliberately left showing "Custom / Unknown / ₹0" —
 * snapshots are immutable, so there is no backfill. What must hold is that
 * every snapshot written from now on carries all three.
 */

type Rows = Map<unknown, unknown[]>;

/**
 * The projection fetches all of its slices in ONE consolidated statement
 * (#229); the stub serves that statement's row, populating the template and
 * closed-user slots from the rows registered per table.
 */
function stubDb(rows: Rows) {
  const first = (table: unknown) => (rows.get(table) ?? [])[0] ?? null;
  return {
    execute: async () => [
      {
        template: first(schema.shiftTemplates),
        closed_user: first(schema.users),
        opened_user: null,
        nr_rows: [],
        ho_rows: [],
        te_rows: [],
        expense_rows: [],
        purchase_rows: [],
        collection_rows: [],
        credit_rows: [],
      },
    ],
  };
}

const shift: ProjectableShift = {
  id: 'shift-1',
  shiftTemplateId: 'tpl-morning',
  openedBy: 'user-opener',
  closedBy: 'user-closer',
  openedAt: '2026-03-01T00:30:00.000Z',
  closedAt: '2026-03-01T08:30:00.000Z',
  openingCash: '5000',
  closingCash: '18500',
};

/** What CloseShift stores: the drawer reconciliation it computed. */
const closeSnapshot = {
  openingCash: 5000,
  closingCash: 18500,
  expectedDrawerCash: 18200,
  cashVariance: 300,
};

const project = (rows: Rows, snapshot: unknown = closeSnapshot) =>
  projectShiftSummary(stubDb(rows) as never, shift, snapshot);

describe('projectShiftSummary', () => {
  const populated: Rows = new Map<unknown, unknown[]>([
    [schema.shiftTemplates, [{ id: 'tpl-morning', name: 'Morning' }]],
    [schema.users, [{ id: 'user-closer', fullName: 'Priya Nair' }]],
  ]);

  it('carries the three fields the history table reads', async () => {
    const out = await project(populated);

    expect(out.templateName).toBe('Morning');
    expect(out.closedByName).toBe('Priya Nair');
    expect(out.expectedCash).toBe(18200);
  });

  it('never leaves the history table with a blank reconciled-by or expected cash', async () => {
    // Both readers join optionally. With no user row, no template and a
    // snapshot that never recorded the expected drawer, the projection must
    // still answer — an absent name is "System", not undefined, and expected
    // cash falls back to the opening drawer, not zero.
    const out = await project(new Map(), { openingCash: 5000 });

    expect(out.templateName).toBe('Custom');
    expect(out.closedByName).toBe('System');
    expect(out.expectedCash).toBe(5000);
    expect(out.expectedCash).not.toBeUndefined();
  });

  it('keeps the stored reconciliation rather than recomputing it', async () => {
    const out = await project(populated);

    expect(out.closingCash).toBe(18500);
    expect(out.openingCash).toBe(5000);
    expect(out.cashVariance).toBe(300);
    expect(out.cashNetChange).toBe(13500);
  });
});
