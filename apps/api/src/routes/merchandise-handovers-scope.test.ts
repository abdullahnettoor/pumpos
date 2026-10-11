import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { transactionsRouter } from './transactions.js';

/**
 * #407 (story 108): an Attendant reading a shift's product handovers gets only
 * their own, decided in the query rather than by the client filtering a list
 * that already crossed the wire. Office roles still read every attendant's.
 */
const SELF = '00000000-0000-0000-0000-0000000000a1';

function fakeDb(wheres: unknown[]) {
  const chain = (rows: unknown[], capture: boolean): any => {
    const c: any = {
      from: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      limit: () => c,
      where: (clause: unknown) => {
        if (capture) wheres.push(clause);
        return c;
      },
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  // The access guard answers from its first reads; the handover read is the
  // first one that selects from sales, which we recognise by its row shape.
  const accessReads: unknown[][] = [
    [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
      },
    ],
    [{ value: 1 }],
    [],
    [],
  ];
  return {
    select: (fields?: Record<string, unknown>) => {
      if (fields && 'attendantName' in fields) return chain([], true);
      return chain(accessReads.shift() ?? [], false);
    },
  };
}

async function read(role: string) {
  const wheres: unknown[] = [];
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', fakeDb(wheres));
    c.set('user', {
      id: SELF,
      email: 'x@example.com',
      fullName: 'X',
      organizationId: 'org-1',
      role,
      assignedStationIds: ['station-1'],
    });
    await next();
  });
  app.route('/transactions', transactionsRouter);
  const res = await app.request('/transactions/shifts/shift-1/merchandise-handovers');
  expect(res.status).toBe(200);
  expect(wheres).toHaveLength(1);
  return new PgDialect().sqlToQuery(wheres[0] as never);
}

describe('GET /transactions/shifts/:id/merchandise-handovers', () => {
  it('limits an Attendant to their own product handover', async () => {
    const q = await read('Attendant');
    expect(q.sql).toContain('"attendant_id" = $');
    expect(q.params).toContain(SELF);
  });

  it.each(['Owner', 'Manager', 'Accountant', 'Staff'])(
    'leaves %s reading every attendant on the shift',
    async (role) => {
      const q = await read(role);
      expect(q.sql).not.toContain('"attendant_id"');
      expect(q.params).not.toContain(SELF);
    },
  );
});
