import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { reportsRouter } from './reports.js';
import { productsRouter } from './products.js';

/** `purchases.viewCosts` must withhold every unit-cost figure, not only purchase rows. */

const PRODUCT = {
  id: 'p-1',
  organizationId: 'org-1',
  name: 'Oil',
  code: 'OIL',
  productType: 'MERCHANDISE',
  inventoryType: 'ITEM',
  stockTracked: true,
  isTaxable: true,
  taxCategory: 'GST',
  unit: 'L',
  brand: null,
  category: null,
  sellingPrice: '100',
  costBasis: '80',
  taxConfig: {},
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const TANK = {
  tankId: 't-1',
  tankName: 'Tank 1',
  productCode: 'MS',
  varianceLitres: '-40',
  soldLitres: '20000',
  dips: 3,
  valueAtCost: '-4000',
};

function fakeDb(products: boolean) {
  const access: unknown[][] = [
    [{ subscriptionPlan: 'CORE', subscriptionStatus: 'ACTIVE', accessUntil: null }],
    [{ value: 1 }],
    [],
    [],
  ];
  let n = 0;
  return {
    select: () => {
      const rows = n < 4 && !products ? access[n] : [PRODUCT];
      n += 1;
      const b: any = {
        from: () => b,
        where: () => b,
        orderBy: () => b,
        limit: () => b,
        then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return b;
    },
    execute: async () => [TANK],
  };
}

function app(withCosts: boolean) {
  // A Manager's defaults, optionally minus View costs (an Owner-customised Permission set).
  const all = ['reports.view', 'products.manage', 'purchases.viewCosts'] as const;
  const permissions = new Set(all.filter((p) => withCosts || p !== 'purchases.viewCosts'));
  const a = new Hono<{ Variables: { db: any; user: any } }>();
  a.use('*', async (c, next) => {
    c.set('db', fakeDb(c.req.path.startsWith('/setup')));
    c.set('user', {
      id: 'u',
      email: 'u@x',
      fullName: 'U',
      organizationId: 'org-1',
      role: 'Manager',
      assignedStationIds: ['st-1'],
      permissions,
    });
    await next();
  });
  a.route('/reports', reportsRouter);
  a.route('/setup', productsRouter);
  return a;
}

describe('unit-cost redaction', () => {
  it('GET /setup/products hides costBasis without View costs', async () => {
    const body = (await (await app(false).request('/setup/products')).json()) as any;
    expect(body.data[0].name).toBe('Oil');
    expect('costBasis' in body.data[0]).toBe(false);
  });
  it('GET /setup/products keeps costBasis with View costs', async () => {
    const body = (await (await app(true).request('/setup/products')).json()) as any;
    expect(body.data[0].costBasis).toBe('80');
  });
  it('stock-loss nulls valueAtCost without View costs', async () => {
    const url = '/reports/insights/stock-loss?stationId=st-1&days=7';
    const hidden = (await (await app(false).request(url)).json()) as any;
    expect(hidden.data[0].valueAtCost).toBeNull();
    expect(hidden.data[0].varianceLitres).toBe(-40);
    const shown = (await (await app(true).request(url)).json()) as any;
    expect(shown.data[0].valueAtCost).toBe(-4000);
  });
});
