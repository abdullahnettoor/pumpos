import { describe, expect, it } from 'vite-plus/test';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { dssrRouter } from './dssr.js';
import { makeFakeDb } from './test-fakes.js';

describe('profit-loss office totals', () => {
  it('reads current head types in one scoped statement and returns the split', async () => {
    let statement: unknown;
    const { db, counter } = makeFakeDb(
      [[], []],
      [
        [
          {
            date: '2026-03-15',
            expenses: 300,
            otherIncome: 75,
            directExpenses: 100,
            indirectExpenses: 200,
            directIncome: 50,
            indirectIncome: 25,
          },
        ],
      ],
      undefined,
      {
        onExecute: (s) => {
          statement = s;
        },
      },
    );
    const app = new Hono<{ Variables: { db: any; user: any } }>();
    app.use('*', async (c, next) => {
      c.set('db', db);
      c.set('user', {
        id: 'user',
        organizationId: 'org',
        role: 'Owner',
        assignedStationIds: ['station'],
      });
      await next();
    });
    app.route('/dssr', dssrRouter);
    const response = await app.request(
      '/dssr/profit-loss?stationId=station&from=2026-03-01&to=2026-03-31',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { totals: unknown } };
    expect(body.data.totals).toMatchObject({
      directExpenses: 100,
      indirectExpenses: 200,
      directIncome: 50,
      indirectIncome: 25,
      grossProfit: -50,
      netProfit: -225,
    });
    expect(counter.executes).toBe(1);
    const query = new PgDialect().sqlToQuery(statement as SQL);
    expect(query.sql).toMatch(/expense_categories/i);
    expect(query.sql).toMatch(/income_categories/i);
    expect(query.sql).toMatch(/nature/i);
    expect(query.sql).toMatch(/organization_id/i);
    expect(query.params).toContain('org');
    expect(query.params).toContain('station');
  });
});
