import { describe, expect, it } from 'vitest';
import { schema } from '@pump/db';
import { projectShiftSummary, type ProjectableShift } from './shift-summary-projection.js';
import { netNozzleVolume, shiftSummaryNetVolume } from './shift-summary-sql.js';

/**
 * #224: the Closed & Locked Shifts history reads `templateName`, `closedByName`
 * and `expectedCash` straight off the stored snapshot. Test-era rows predate
 * those fields and are deliberately left showing "Custom / Unknown / ₹0" —
 * snapshots are immutable, so there is no backfill. What must hold is that
 * every snapshot written from now on carries all three.
 */

type Rows = Map<unknown, unknown[]>;

describe('shared Shift Summary volume rules', () => {
  it('uses one gross-minus-testing fallback for legacy snapshots', () => {
    expect(shiftSummaryNetVolume({ totalVolume: 125, totalTesting: 5 })).toBe(120);
    expect(shiftSummaryNetVolume({ totalVolume: 125, totalTestingVolume: 5 })).toBe(120);
  });

  it('uses readings before the snapshot total and clamps testing to the metered volume', () => {
    expect(shiftSummaryNetVolume({ totalNetVolume: 999 }, [{ netVolume: 45 }])).toBe(45);
    expect(netNozzleVolume(10, 12)).toBe(0);
    expect(netNozzleVolume(10, -2)).toBe(10);
  });
});

/**
 * The projection fetches all of its slices in ONE consolidated statement
 * (#229); the stub serves that statement's row, populating the template and
 * closed-user slots from the rows registered per table.
 */
function stubDb(rows: Rows, extra: Record<string, unknown> = {}) {
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
        collection_rows: [],
        credit_rows: [],
        product_rows: [],
        product_total: 0,
        ...extra,
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

const project = (
  rows: Rows,
  snapshot: unknown = closeSnapshot,
  extra: Record<string, unknown> = {},
) => projectShiftSummary(stubDb(rows, extra) as never, shift, snapshot);

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

  it('shows no attendant/office split on a pre-#287 snapshot (#287)', async () => {
    // Old model: cashVariance already includes the attendant shortage.
    const out = await project(populated, {
      ...closeSnapshot,
      cashVariance: -200,
      drawers: [{ attendantId: 'a', duId: 'd', variance: -200 }],
    });
    expect(out.cashVarianceModel).toBe(1);
    expect(out.attendantVariance).toBeNull();
    expect(out.officeCountVariance).toBeNull();
    expect(out.cashVariance).toBe(-200);
  });

  it('carries both variances on a two-level snapshot, idempotently', async () => {
    const snap = {
      ...closeSnapshot,
      cashVarianceModel: 2,
      cashVariance: -100,
      attendantVariance: -200,
      officeCountVariance: -100,
    };
    const out = await project(populated, snap);
    expect(out).toMatchObject({
      cashVarianceModel: 2,
      attendantVariance: -200,
      officeCountVariance: -100,
    });
    const again = await project(populated, out);
    expect(again).toMatchObject({ cashVarianceModel: 2, attendantVariance: -200 });
  });

  describe('sales figures the Shift Summary page reads', () => {
    const reading = (nozzleId: string, duName: string | null) => ({
      nr: {
        nozzleId,
        openingReading: '100',
        closingReading: '200',
        volumeSold: '100',
        testingVolume: '0',
        unitPrice: '100',
      },
      nz: { name: 'N1' },
      prod: { name: 'Petrol', code: 'MS', unit: 'L' },
      duName,
    });
    const handover = (id: string, upi: string, card: string) => ({
      h: { id, upiHandedOver: upi, cardHandedOver: card, creditHandedOver: '0' },
      userName: 'Ravi',
      duName: 'DU1',
    });

    it('carries Product Sales grouped by product id, with the total sales', async () => {
      const out = await project(
        populated,
        { ...closeSnapshot, totalFuelSalesValue: 10000 },
        {
          product_rows: [
            {
              productId: 'p1',
              productName: 'Engine Oil',
              productType: 'LUBRICANT',
              quantity: 3,
              lineTotal: 900,
            },
            {
              productId: 'p2',
              productName: 'Engine Oil',
              productType: 'ACCESSORY',
              quantity: 1,
              lineTotal: 450,
            },
          ],
          product_total: 1416,
        },
      );
      expect(out.productSales).toEqual({
        total: 1416,
        lines: [
          {
            productId: 'p1',
            productName: 'Engine Oil',
            productType: 'LUBRICANT',
            quantity: 3,
            value: 900,
          },
          {
            productId: 'p2',
            productName: 'Engine Oil',
            productType: 'ACCESSORY',
            quantity: 1,
            value: 450,
          },
        ],
      });
      expect(out.totalProductSalesValue).toBe(1416);
      expect(out.totalSalesValue).toBe(11416);
    });

    it('groups the Product Sales SQL by product type in the one statement', async () => {
      const { PgDialect } = await import('drizzle-orm/pg-core');
      const statements: unknown[] = [];
      const db = {
        execute: async (q: unknown) => {
          statements.push(q);
          return [{ nr_rows: [], ho_rows: [], te_rows: [], credit_rows: [], product_rows: [] }];
        },
      };
      await projectShiftSummary(db as never, shift, closeSnapshot);
      expect(statements).toHaveLength(1);
      const { sql: text } = new PgDialect().sqlToQuery(statements[0] as never);
      expect(text).toContain('GROUP BY si.product_id, p.name, p.product_type');
      expect(text).toContain(`'productType', t.product_type`);
    });

    it('has zero Product Sales (not a missing field) for a Shift with none', async () => {
      const out = await project(populated, { ...closeSnapshot, totalFuelSalesValue: 500 });
      expect(out.productSales).toEqual({ total: 0, lines: [] });
      expect(out.totalSalesValue).toBe(500);
    });

    it('carries the payment split from the Handovers, the cash sales and the credit sales', async () => {
      const out = await project(
        populated,
        { ...closeSnapshot, reconciliation: { cashSales: 3000 } },
        {
          ho_rows: [handover('h1', '100', '40'), handover('h2', '60', '0')],
          credit_rows: [{ id: 'c1', amount: '250', customerId: 'cu1' }],
        },
      );
      expect(out.payments).toEqual({ cash: 3000, upi: 160, card: 40, credit: 250 });
    });

    it('names the Dispenser Unit on each reading', async () => {
      const out = await project(populated, closeSnapshot, {
        nr_rows: [reading('n1', 'DU1'), reading('n2', null)],
      });
      expect((out.nozzleReadings as { duName: string | null }[]).map((r) => r.duName)).toEqual([
        'DU1',
        null,
      ]);
    });

    it('is idempotent over its own output', async () => {
      const extra = { product_rows: [], product_total: 0 };
      const once = await project(populated, { ...closeSnapshot, totalFuelSalesValue: 500 }, extra);
      const twice = await project(populated, once, extra);
      expect(twice.totalSalesValue).toBe(once.totalSalesValue);
      expect(twice.payments).toEqual(once.payments);
    });
  });
});
