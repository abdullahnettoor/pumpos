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
 * A drizzle query builder stubbed down to what the projection uses: every
 * chained method returns the builder, and awaiting it yields the rows
 * registered for the table given to `.from()`. Keying on the table rather than
 * on call order means the test does not break when the projection reorders its
 * parallel batch.
 */
function stubDb(rows: Rows) {
  const builder = () => {
    let table: unknown = null;
    const self: Record<string, unknown> = {};
    const chain = (fn?: (arg: unknown) => void) => (arg: unknown) => {
      fn?.(arg);
      return self;
    };
    Object.assign(self, {
      select: chain(),
      from: chain((t) => {
        table = t;
      }),
      innerJoin: chain(),
      leftJoin: chain(),
      where: chain(),
      orderBy: chain(),
      limit: chain(),
      then: (resolve: (v: unknown[]) => unknown) => resolve(rows.get(table) ?? []),
    });
    return self;
  };
  return { select: (...a: unknown[]) => (builder().select as (...x: unknown[]) => unknown)(...a) };
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
