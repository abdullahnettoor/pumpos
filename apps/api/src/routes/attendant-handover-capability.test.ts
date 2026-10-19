import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * #649: an Attendant handing over from their own phone is the
 * `handover.attendant_phone` Product Capability (Pro and Pro+). A manager
 * recording the same handover from the office works on every plan.
 */
// The write-policy guard reads access once; the capability guard (Attendants
// only) reads it again.
function db(plan: string, passes: number) {
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

function app(role: string, plan: string) {
  const instance = new Hono<{ Variables: { db: any; user: any } }>();
  instance.use('*', async (c, next) => {
    c.set('db', db(plan, role === 'Attendant' ? 2 : 1));
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

const post = (role: string, plan: string) =>
  app(role, plan).request('/shifts/handovers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shiftId: '00000000-0000-0000-0000-0000000000b1',
      duId: '00000000-0000-0000-0000-0000000000c1',
      ...(role === 'Attendant' ? {} : { userId: '00000000-0000-0000-0000-0000000000a2' }),
      cashHandedOver: 100,
      nozzleReadings: [{ nozzleId: '00000000-0000-0000-0000-0000000000d1', closingReading: 10 }],
    }),
  });

describe('Attendant phone handover capability (#649)', () => {
  it('Core refuses an Attendant self-handover', async () => {
    const res = await post('Attendant', 'CORE');
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error.code).toBe('CAPABILITY_NOT_ENTITLED');
  });

  it.each(['PRO', 'PRO_PLUS'])('%s lets an Attendant through', async (plan) => {
    expect(await (await post('Attendant', plan)).json()).toEqual({ reached: true });
  });

  it.each(['CORE', 'PRO', 'PRO_PLUS'])('%s lets a Manager record a handover', async (plan) => {
    expect(await (await post('Manager', plan)).json()).toEqual({ reached: true });
  });
});
