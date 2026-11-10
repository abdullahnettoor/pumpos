import { describe, expect, it } from 'vite-plus/test';
import { Hono } from 'hono';
import { transactionsRouter } from './transactions.js';

/**
 * GET /transactions/purchases is an explicit contract (#312): exactly these
 * fields, no `shiftId` (purchases are business-day anchored, never shift).
 */
const EXPECTED_KEYS = [
  'amount',
  'awaitingDecantation',
  'businessDate',
  'businessDayId',
  'cessTotal',
  'cgstTotal',
  'createdAt',
  'documentNumber',
  'entryDate',
  'id',
  'igstTotal',
  'invoiceNumber',
  'itemCount',
  'itemsSummary',
  'notes',
  'organizationId',
  'sgstTotal',
  'stationId',
  'supplierId',
  'supplierName',
  'taxableAmount',
  'vatTotal',
].sort();

// What the database would hand back for whatever columns the route selects.
const VALUES: Record<string, unknown> = {
  amount: '118.00',
  taxableAmount: '100.00',
  cgstTotal: '9.00',
  sgstTotal: '9.00',
  igstTotal: '0',
  vatTotal: '0',
  cessTotal: '0',
  awaitingDecantation: false,
  itemCount: 2,
};

function makeDb() {
  return {
    select: (selection: Record<string, unknown>) => {
      const row = Object.fromEntries(
        Object.keys(selection).map((k) => [k, k in VALUES ? VALUES[k] : `${k}-value`]),
      );
      const c: any = {
        from: () => c,
        where: () => c,
        orderBy: () => c,
        leftJoin: () => c,
        then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
          Promise.resolve([row]).then(res, rej),
      };
      return c;
    },
  };
}

function app(withCosts: boolean) {
  const a = new Hono<{ Variables: { db: any; user: any } }>();
  a.use('*', async (c, next) => {
    c.set('db', makeDb());
    c.set('user', {
      id: 'u1',
      email: 'u@example.com',
      fullName: 'U',
      organizationId: 'org-1',
      role: 'Manager',
      assignedStationIds: ['st-1'],
      permissions: new Set(withCosts ? ['purchases.viewCosts'] : []),
    });
    await next();
  });
  a.route('/transactions', transactionsRouter);
  return a;
}

describe('GET /transactions/purchases response contract', () => {
  it('returns exactly the documented fields and no shiftId', async () => {
    const res = await app(true).request('/transactions/purchases');
    const body = (await res.json()) as any;
    expect(Object.keys(body.data[0]).sort()).toEqual(EXPECTED_KEYS);
    expect(body.data[0]).not.toHaveProperty('shiftId');
    expect(body.data[0].amount).toBe('118.00');
  });

  it('keeps cost redaction on the explicit shape', async () => {
    const body = (await (await app(false).request('/transactions/purchases')).json()) as any;
    expect(Object.keys(body.data[0]).sort()).toEqual(EXPECTED_KEYS);
    for (const f of [
      'amount',
      'taxableAmount',
      'cgstTotal',
      'sgstTotal',
      'igstTotal',
      'vatTotal',
      'cessTotal',
    ])
      expect(body.data[0][f]).toBeNull();
    expect(body.data[0].documentNumber).toBe('documentNumber-value');
  });
});
