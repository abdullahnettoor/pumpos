import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * #301: an Accountant (or Attendant) covering a pump hands over only their own
 * Drawer. Naming another Drawer holder is refused before anything is read,
 * instead of being silently rewritten to the caller.
 */
function db() {
  // The access guard's four reads, then any further read means the request got
  // past the self-scope check.
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

function app(role: string) {
  const instance = new Hono<{ Variables: { db: any; user: any } }>();
  instance.use('*', async (c, next) => {
    c.set('db', db());
    c.set('user', {
      id: '00000000-0000-0000-0000-0000000000a1',
      email: 'x@example.com',
      fullName: 'X',
      organizationId: 'org-1',
      role,
      assignedStationIds: ['station-1'],
    });
    await next();
  });
  instance.onError((e, c) => c.json({ reached: e.message === 'REACHED_HANDLER' }, 500));
  instance.route('/shifts', shiftsRouter);
  return instance;
}

const body = (userId?: string) =>
  JSON.stringify({
    shiftId: '00000000-0000-0000-0000-0000000000b1',
    duId: '00000000-0000-0000-0000-0000000000c1',
    ...(userId ? { userId } : {}),
    cashHandedOver: 100,
    nozzleReadings: [{ nozzleId: '00000000-0000-0000-0000-0000000000d1', closingReading: 10 }],
  });

const post = (role: string, userId?: string) =>
  app(role).request('/shifts/handovers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body(userId),
  });

const OTHER = '00000000-0000-0000-0000-0000000000a2';
const SELF = '00000000-0000-0000-0000-0000000000a1';

describe('POST /shifts/handovers self-scope (#301)', () => {
  it.each(['Accountant', 'Attendant'])(
    "refuses a %s recording someone else's handover",
    async (role) => {
      const res = await post(role, OTHER);
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.error.message).toBe('You may record only your own handover');
    },
  );

  it.each([
    ['Accountant, own userId', 'Accountant', SELF],
    ['Accountant, no userId', 'Accountant', undefined],
    ['Manager, another holder', 'Manager', OTHER],
  ])('lets %s through to the handler', async (_label, role, userId) => {
    const res = await post(role, userId);
    expect(await res.json()).toEqual({ reached: true });
  });
});
