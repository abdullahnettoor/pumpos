import { Hono } from 'hono';
import { describe, expect, it } from 'vite-plus/test';
import { schema } from '@pump/db';
import type { Role } from '@pump/shared';
import { transactionsRouter } from './transactions.js';

/**
 * Expense and income heads carry a Type, Direct or Indirect (#685). Wire
 * contract through the mounted router: the default on create, accepted on
 * create and update, returned by the list, an unknown value refused, and the
 * Role gate unchanged.
 */

const ORG = 'org-1';
const HEAD_ID = '11111111-1111-4111-8111-111111111111';

interface Write {
  table: unknown;
  values: any;
  set?: any;
}

const KINDS = [
  { kind: 'expense', path: 'expense-categories', table: schema.expenseCategories },
  { kind: 'income', path: 'income-categories', table: schema.incomeCategories },
] as const;

type Kind = (typeof KINDS)[number];

const headRow = (nature: string) => ({
  id: HEAD_ID,
  organizationId: ORG,
  name: 'Generator Diesel',
  nature,
  isSystem: true,
  taxConfig: null,
  isActive: true,
});

function fakeDb(writes: Write[], table: unknown, existing: unknown[]) {
  const rows = new Map<unknown, unknown[]>([
    [
      schema.organizations,
      [
        {
          subscriptionPlan: 'CORE',
          subscriptionStatus: 'ACTIVE',
          accessUntil: null,
          suspendedAt: null,
        },
      ],
    ],
    [table, existing],
  ]);
  const chain = (projected: boolean): any => {
    let from: unknown = null;
    const self: any = {};
    const step = (fn?: (a: unknown) => void) => (a: unknown) => {
      fn?.(a);
      return self;
    };
    Object.assign(self, {
      from: step((t) => {
        from = t;
      }),
      where: step(),
      orderBy: step(),
      limit: step(),
      innerJoin: step(),
      leftJoin: step(),
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) => {
        // A projected select on the head table is the name-uniqueness probe: no clash.
        const out = projected && from === table ? [] : (rows.get(from) ?? []);
        return Promise.resolve(out).then(res, rej);
      },
    });
    return self;
  };
  const db: any = {
    select: (fields?: unknown) => chain(fields !== undefined),
    insert: (t: unknown) => ({
      values: (values: any) => {
        const write: Write = { table: t, values };
        writes.push(write);
        const done: any = Promise.resolve([]);
        done.onConflictDoUpdate = (cfg: any) => {
          write.set = cfg?.set;
          return Promise.resolve([]);
        };
        done.onConflictDoNothing = () => Promise.resolve([]);
        done.returning = () => Promise.resolve([]);
        return done;
      },
    }),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return db;
}

async function call(
  k: Kind,
  role: Role,
  method: 'GET' | 'POST' | 'PUT',
  body?: Record<string, unknown>,
  existing: unknown[] = [],
) {
  const writes: Write[] = [];
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', fakeDb(writes, k.table, existing));
    c.set('user', {
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'Someone',
      organizationId: ORG,
      role,
      assignedStationIds: [],
    });
    await next();
  });
  app.route('/transactions', transactionsRouter);
  const url = `/transactions/${k.path}${method === 'PUT' ? `/${HEAD_ID}` : ''}`;
  const res = await app.request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as any;
  const head = writes.find((w) => w.table === k.table);
  const event = writes.find((w) => w.table === schema.events)?.values;
  return {
    status: res.status,
    code: json?.error?.code ?? null,
    data: json?.data,
    saved: head?.values,
    set: head?.set,
    event: Array.isArray(event) ? event[0] : event,
  };
}

describe.each(KINDS)('$kind heads: Type (Direct / Indirect)', (k) => {
  it('defaults the Type to INDIRECT on create', async () => {
    const r = await call(k, 'Owner', 'POST', { name: 'Tea' });
    expect(r.status).toBe(200);
    expect(r.saved).toMatchObject({ name: 'Tea', nature: 'INDIRECT', isSystem: false });
    expect(r.data.nature).toBe('INDIRECT');
  });

  it('accepts DIRECT on create and records it on the event', async () => {
    const r = await call(k, 'Manager', 'POST', { name: 'Diesel', nature: 'DIRECT' });
    expect(r.status).toBe(200);
    expect(r.saved.nature).toBe('DIRECT');
    expect(r.event.payload).toMatchObject({ kind: k.kind, name: 'Diesel', nature: 'DIRECT' });
  });

  it('accepts a Type-only update and records before/after on the event', async () => {
    const r = await call(k, 'Accountant', 'PUT', { nature: 'INDIRECT' }, [headRow('DIRECT')]);
    expect(r.status).toBe(200);
    expect(r.set.nature).toBe('INDIRECT');
    expect(r.set.name).toBe('Generator Diesel');
    expect(r.data.nature).toBe('INDIRECT');
    expect(r.event.payload).toMatchObject({
      categoryId: HEAD_ID,
      nature: { before: 'DIRECT', after: 'INDIRECT' },
    });
  });

  it('returns the Type on the list', async () => {
    const r = await call(k, 'Staff', 'GET', undefined, [headRow('DIRECT')]);
    expect(r.status).toBe(200);
    expect(r.data).toEqual([
      expect.objectContaining({ name: 'Generator Diesel', nature: 'DIRECT' }),
    ]);
  });

  it('seeds the default heads with their Type when the Organization has none', async () => {
    const r = await call(k, 'Owner', 'GET');
    expect(r.saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: k.kind === 'expense' ? 'Generator Diesel' : 'Commission',
          nature: 'DIRECT',
          isSystem: true,
        }),
        expect.objectContaining({
          name: k.kind === 'expense' ? 'Office Stationery' : 'Interest',
          nature: 'INDIRECT',
        }),
      ]),
    );
  });

  it.each(['SOMETHING', 'direct', '', null, 1])('refuses the Type %j on create', async (nature) => {
    const r = await call(k, 'Owner', 'POST', { name: 'Tea', nature });
    expect({ status: r.status, code: r.code }).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    expect(r.saved).toBeUndefined();
    expect(r.event).toBeUndefined();
  });

  it('refuses an unknown Type on update', async () => {
    const r = await call(k, 'Owner', 'PUT', { nature: 'SOMETHING' }, [headRow('DIRECT')]);
    expect({ status: r.status, code: r.code }).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    expect(r.saved).toBeUndefined();
  });

  it.each(['Owner', 'Manager', 'Accountant'] as const)('lets a %s set the Type', async (role) => {
    expect((await call(k, role, 'POST', { name: 'Tea', nature: 'DIRECT' })).status).toBe(200);
  });

  it.each(['POST', 'PUT'] as const)('refuses Staff on %s with 403 FORBIDDEN', async (method) => {
    const r = await call(k, 'Staff', method, { name: 'Tea', nature: 'DIRECT' }, [
      headRow('INDIRECT'),
    ]);
    expect({ status: r.status, code: r.code }).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(r.saved).toBeUndefined();
  });
});
