import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { reportsRouter } from './reports.js';

/**
 * Worker CPU budget for the Insights part 2 routes (#402): each is ONE
 * aggregate statement whatever the range or the history behind it, scoped to
 * the caller's organization and the station, and mapped to the wire without
 * any per-row work that grows with the data.
 *
 * The attendant route also runs the Product Capability check, which reads the
 * Organization's access (a fixed four selects, the same as every gated route);
 * the data read itself is the single `execute`.
 */

const ORG = 'org-1';
const STATION = 'st-1';

function makeFakeDb(row: unknown[], grants: string[] = ['reports.attendant']) {
  const counter = { selects: 0, executes: 0 };
  const statements: unknown[] = [];
  // The four reads of one capability check; a fake shared by several requests cycles through them.
  const accessReads: unknown[][] = [
    [{ subscriptionPlan: 'CORE', subscriptionStatus: 'ACTIVE', accessUntil: null }],
    [{ value: 1 }],
    grants.map((capabilityKey) => ({ capabilityKey })),
    [],
  ];
  const db = {
    select: () => {
      counter.selects += 1;
      const rows = accessReads[(counter.selects - 1) % accessReads.length];
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
    execute: async (statement: unknown) => {
      counter.executes += 1;
      statements.push(statement);
      return row;
    },
  };
  return { db, counter, statements };
}

function makeApp(db: unknown, role = 'Owner') {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: ORG,
      role,
      assignedStationIds: [STATION],
    });
    await next();
  });
  app.route('/reports', reportsRouter);
  return app;
}

const ATTENDANTS = [
  {
    attendantId: 'a-1',
    name: 'Ravi',
    shifts: 6,
    shortShifts: 3,
    overShifts: 0,
    netVariance: '-420.50',
  },
  {
    attendantId: 'a-2',
    name: 'Meena',
    shifts: 5,
    shortShifts: 0,
    overShifts: 2,
    netVariance: '75.00',
  },
];
const TANKS = [
  {
    tankId: 't-1',
    tankName: 'Tank 1',
    productCode: 'MS',
    varianceLitres: '-40.000',
    soldLitres: '20000.000',
    costBasis: '90.0000',
  },
];
const CREDIT = [
  {
    bounds: {
      to: '2026-03-10',
      from: '2026-03-04',
      previousTo: '2026-03-03',
      previousFrom: '2026-02-25',
    },
    current: { creditGiven: 50000, sales: 400000, closedDays: 5 },
    previous: { creditGiven: 40000, closedDays: 5 },
    collected: 30000,
  },
];

const ROUTES = [
  { name: 'attendant-variance', rows: ATTENDANTS },
  { name: 'stock-loss', rows: TANKS },
  { name: 'credit-health', rows: CREDIT },
] as const;

describe.each(ROUTES)('GET /reports/insights/$name', ({ name, rows }) => {
  const url = (days: number | string) =>
    `/reports/insights/${name}?stationId=${STATION}&days=${days}`;

  it('reads with ONE statement, the same for 7 and 90 days', async () => {
    const counts: number[] = [];
    for (const days of [7, 90]) {
      const { db, counter } = makeFakeDb(rows as unknown[]);
      const res = await makeApp(db).request(url(days));
      expect(res.status).toBe(200);
      counts.push(counter.executes);
    }
    expect(counts).toEqual([1, 1]);
  });

  it('scopes the statement to the caller organization, the station and the range length', async () => {
    const { db, statements } = makeFakeDb(rows as unknown[]);
    await makeApp(db).request(url(30));
    const { params } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(params).toContain(ORG);
    expect(params).toContain(STATION);
    expect(params).toContain(30);
  });

  it('refuses a range length the tab does not offer, before reading', async () => {
    const { db, counter } = makeFakeDb(rows as unknown[]);
    for (const days of ['14', '', 'abc']) {
      expect((await makeApp(db).request(url(days))).status).toBe(400);
    }
    expect(counter.executes).toBe(0);
  });

  it('refuses a missing stationId and a foreign station', async () => {
    const { db, counter } = makeFakeDb(rows as unknown[]);
    expect((await makeApp(db).request(`/reports/insights/${name}?days=7`)).status).toBe(400);
    expect(
      (await makeApp(db, 'Manager').request(`/reports/insights/${name}?stationId=st-9&days=7`))
        .status,
    ).toBe(403);
    expect(counter.executes).toBe(0);
  });
});

describe('GET /reports/insights/attendant-variance', () => {
  const url = `/reports/insights/attendant-variance?stationId=${STATION}&days=30`;

  it('maps the aggregate rows to the wire, the most short first', async () => {
    const { db } = makeFakeDb(ATTENDANTS);
    const body = (await (await makeApp(db).request(url)).json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      {
        attendantId: 'a-1',
        name: 'Ravi',
        shifts: 6,
        shortShifts: 3,
        overShifts: 0,
        netVariance: -420.5,
      },
      {
        attendantId: 'a-2',
        name: 'Meena',
        shifts: 5,
        shortShifts: 0,
        overShifts: 2,
        netVariance: 75,
      },
    ]);
  });

  it('reads sealed Shift Summaries of closed Shifts only', async () => {
    const { db, statements } = makeFakeDb(ATTENDANTS);
    await makeApp(db).request(url);
    const { sql: text } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(text).toContain('shift_summaries');
    expect(text).toContain('jsonb_to_recordset');
    expect(text).toContain("bd.status = 'CLOSED'");
    expect(text).toContain('LIMIT');
  });

  it('refuses an Organization without the capability, whatever the Role, with no data read', async () => {
    const { db, counter } = makeFakeDb(ATTENDANTS, []);
    const res = await makeApp(db).request(url);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CAPABILITY_NOT_ENTITLED');
    expect(counter.executes).toBe(0);
  });

  it('refuses a Role that may not see the Attendant Handover Report even when entitled', async () => {
    for (const role of ['Staff', 'Attendant']) {
      const { db, counter } = makeFakeDb(ATTENDANTS);
      const res = await makeApp(db, role).request(url);
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).error.code).toBe('FORBIDDEN');
      expect(counter.executes).toBe(0);
    }
  });
});

describe('GET /reports/insights/stock-loss', () => {
  const url = `/reports/insights/stock-loss?stationId=${STATION}&days=7`;

  it('maps the tank rows to litres, share of sold, rupees at cost and the tolerance flag', async () => {
    const { db } = makeFakeDb(TANKS);
    const body = (await (await makeApp(db).request(url)).json()) as any;
    expect(body.data).toEqual([
      {
        tankId: 't-1',
        tankName: 'Tank 1',
        productCode: 'MS',
        varianceLitres: -40,
        soldLitres: 20000,
        pctOfSold: -0.2,
        valueAtCost: -3600,
        withinTolerance: true,
      },
    ]);
  });

  it('reads recorded dips of closed days and sales from sealed snapshots', async () => {
    const { db, statements } = makeFakeDb(TANKS);
    await makeApp(db).request(url);
    const { sql: text } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(text).toContain('stock_variances');
    expect(text).toContain('dssr_snapshots');
    expect(text).toContain("bd.status = 'CLOSED'");
    expect(text).toContain('openShiftAtRecording');
  });

  it('refuses roles that cannot view reports', async () => {
    for (const role of ['Staff', 'Attendant']) {
      const { db, counter } = makeFakeDb(TANKS);
      expect((await makeApp(db, role).request(url)).status).toBe(403);
      expect(counter.executes).toBe(0);
    }
  });
});

describe('GET /reports/insights/credit-health', () => {
  const url = `/reports/insights/credit-health?stationId=${STATION}&days=7`;

  it('maps the summary row to the wire contract', async () => {
    const { db } = makeFakeDb(CREDIT);
    const body = (await (await makeApp(db).request(url)).json()) as any;
    expect(body.data).toEqual({
      range: { from: '2026-03-04', to: '2026-03-10' },
      creditGiven: 50000,
      collected: 30000,
      receivablesChange: 20000,
      creditShareOfSales: 12.5,
      closedDays: 5,
      previousCreditGiven: 40000,
      creditGivenChangePct: 25,
    });
  });

  it('places Credit Sales by Business Date and Collections by Entry Date', async () => {
    const { db, statements } = makeFakeDb(CREDIT);
    await makeApp(db).request(url);
    const { sql: text } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(text).toContain("ds.snapshot_data -> 'credit' ->> 'total'");
    expect(text).toContain('c.entry_date BETWEEN');
    expect(text).toContain("bd.status = 'CLOSED'");
    // Collections are Office Records: never reached through a Business Day or a Shift.
    expect(text).not.toMatch(/collections[^,]*business_day/);
  });

  it('answers zeros for a station with no closed day', async () => {
    const { db } = makeFakeDb([{ bounds: null, current: null, previous: null, collected: 0 }]);
    const body = (await (await makeApp(db).request(url)).json()) as any;
    expect(body.data).toMatchObject({
      range: null,
      creditGiven: 0,
      collected: 0,
      receivablesChange: 0,
      creditShareOfSales: null,
      creditGivenChangePct: null,
    });
  });

  it('refuses roles that cannot view reports', async () => {
    for (const role of ['Staff', 'Attendant']) {
      const { db, counter } = makeFakeDb(CREDIT);
      expect((await makeApp(db, role).request(url)).status).toBe(403);
      expect(counter.executes).toBe(0);
    }
  });
});
