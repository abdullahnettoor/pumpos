import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { reportsRouter } from './reports.js';

/**
 * The wire contract of the Attendant Handover Report.
 *
 * Two axes refuse independently and must not be conflated: an Organization
 * without the `reports.attendant` Product Capability is refused with
 * CAPABILITY_NOT_ENTITLED whatever the caller's Role, and an Attendant or
 * Staff user of an entitled Organization is still refused with FORBIDDEN.
 */

const HANDOVER_ROW = {
  handoverId: 'h-1',
  shiftId: 'sh-1',
  businessDate: '2026-03-01',
  shiftTemplateName: 'Morning',
  closedAt: new Date('2026-03-01T14:00:00Z'),
  attendantId: 'att-1',
  attendantName: 'Ravi',
  duId: 'du-1',
  duName: 'DU 1',
  cashHandedOver: '1000.00',
  cardHandedOver: '200.00',
  upiHandedOver: '300.00',
  creditHandedOver: '100.00',
  expectedSales: '1650.00',
  varianceAmount: '-50.00',
  testingVolume: '5.000',
};

/**
 * Serves the access reader's four reads (organization, station count, grants,
 * limit overrides) and then the report reader's single joined select.
 */
function fakeDb(
  grants: string[],
  handoverRows: unknown[] = [HANDOVER_ROW],
  saleRows: unknown[] = [],
  creditRows: unknown[] = [],
) {
  const queue: unknown[][] = [
    [{ subscriptionPlan: 'CORE', subscriptionStatus: 'ACTIVE', accessUntil: null }],
    [{ value: 1 }],
    grants.map((capabilityKey) => ({ capabilityKey })),
    [],
    handoverRows,
    saleRows,
    creditRows,
  ];
  return {
    select() {
      const rows = queue.shift() ?? [];
      const builder: any = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject),
      };
      return builder;
    },
  };
}

function makeApp(db: unknown, role = 'Owner') {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'org-1',
      role,
      // Non-Owner roles reach a station only through an assignment.
      assignedStationIds: ['st-1'],
    });
    await next();
  });
  app.route('/reports', reportsRouter);
  return app;
}

const URL = '/reports/attendant-handovers?stationId=st-1&from=2026-03-01&to=2026-03-31';

describe('GET /reports/attendant-handovers', () => {
  it('refuses an Organization that was never granted the capability', async () => {
    const res = await makeApp(fakeDb([])).request(URL);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CAPABILITY_NOT_ENTITLED');
  });

  it('returns the report for an Organization holding the grant', async () => {
    const res = await makeApp(fakeDb(['reports.attendant'])).request(URL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.stationId).toBe('st-1');
    expect(body.data.attendants).toHaveLength(1);
    expect(body.data.attendants[0]).toMatchObject({
      attendantId: 'att-1',
      attendantName: 'Ravi',
      shiftsWorked: 1,
    });
    expect(body.data.attendants[0].totals.cashHandedOver).toBe(1000);
    expect(body.data.attendants[0].totals.varianceAmount).toBe(-50);
  });

  it('reports the sales components separately for an attendant', async () => {
    const res = await makeApp(
      fakeDb(
        ['reports.attendant'],
        [HANDOVER_ROW],
        [
          { shiftId: 'sh-1', attendantId: 'att-1', captureMechanism: 'POS', totalAmount: '400.00' },
          {
            shiftId: 'sh-1',
            attendantId: 'att-1',
            captureMechanism: 'MERCH_HANDOVER',
            totalAmount: '900.00',
          },
        ],
        [{ shiftId: 'sh-1', attendantId: 'att-1', amount: '800.00' }],
      ),
    ).request(URL);
    const body = (await res.json()) as any;
    expect(body.data.attendants[0].totals).toMatchObject({
      billedSales: 400,
      handoverProductSales: 900,
      creditSales: 800,
      expectedFuelSales: 1650,
    });
  });

  it.each(['Attendant', 'Staff'])('refuses a %s of an entitled Organization', async (role) => {
    const res = await makeApp(fakeDb(['reports.attendant']), role).request(URL);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it.each(['Manager', 'Accountant'])('admits a %s of an entitled Organization', async (role) => {
    const res = await makeApp(fakeDb(['reports.attendant']), role).request(URL);
    expect(res.status).toBe(200);
  });

  it('rejects a request with no station to authorize against', async () => {
    const res = await makeApp(fakeDb(['reports.attendant'])).request(
      '/reports/attendant-handovers?from=2026-03-01&to=2026-03-31',
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a malformed or inverted date range', async () => {
    const missing = await makeApp(fakeDb(['reports.attendant'])).request(
      '/reports/attendant-handovers?stationId=st-1',
    );
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as any).error.code).toBe('VALIDATION_ERROR');

    const inverted = await makeApp(fakeDb(['reports.attendant'])).request(
      '/reports/attendant-handovers?stationId=st-1&from=2026-03-31&to=2026-03-01',
    );
    expect(inverted.status).toBe(400);
    expect(((await inverted.json()) as any).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns an empty attendant list when the range holds no closed-shift handovers', async () => {
    const res = await makeApp(fakeDb(['reports.attendant'], [])).request(URL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.attendants).toEqual([]);
  });
});
