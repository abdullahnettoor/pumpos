import { Hono, type Hono as HonoApp } from 'hono';

/**
 * Shared fixture for handover route tests. The db fake answers the access
 * guard's four reads (once for the write-policy guard, and again for the
 * capability guard when the caller is an Attendant), then throws
 * `REACHED_HANDLER` so a test can tell a request got past every guard.
 */
export const SELF_USER_ID = '00000000-0000-0000-0000-0000000000a1';

function fakeDb(plan: string, passes: number) {
  const accessRows: unknown[][] = [
    [
      {
        subscriptionPlan: plan,
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
      },
    ],
    [{ value: 1 }],
    [],
    [],
  ];
  const accessReads = Array.from({ length: passes }, () => accessRows).flat();
  const chain = (rows: unknown[]): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => c,
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  return {
    select: () => {
      if (accessReads.length > 0) return chain(accessReads.shift()!);
      throw new Error('REACHED_HANDLER');
    },
  };
}

export function handoverApp(options: {
  mountPath: string;
  router: HonoApp<any>;
  role: string;
  plan?: string;
}) {
  const { mountPath, router, role, plan = 'PRO' } = options;
  const instance = new Hono<{ Variables: { db: any; user: any } }>();
  instance.use('*', async (c, next) => {
    c.set('db', fakeDb(plan, role === 'Attendant' ? 2 : 1));
    c.set('user', {
      id: SELF_USER_ID,
      email: 'x@example.com',
      fullName: 'X',
      organizationId: 'org-1',
      role,
      assignedStationIds: ['station-1'],
    });
    await next();
  });
  instance.onError((e, c) => c.json({ reached: e.message === 'REACHED_HANDLER' }, 500));
  instance.route(mountPath, router);
  return instance;
}
