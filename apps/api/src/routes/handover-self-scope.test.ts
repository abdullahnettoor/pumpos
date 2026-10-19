import { describe, expect, it } from 'vitest';
import { shiftsRouter } from './shifts.js';
import { handoverApp, SELF_USER_ID } from './handover-route-fixture.js';

/**
 * #301: an Accountant (or Attendant) covering a pump hands over only their own
 * Drawer. Naming another Drawer holder is refused before anything is read,
 * instead of being silently rewritten to the caller.
 */
const body = (userId?: string) =>
  JSON.stringify({
    shiftId: '00000000-0000-0000-0000-0000000000b1',
    duId: '00000000-0000-0000-0000-0000000000c1',
    ...(userId ? { userId } : {}),
    cashHandedOver: 100,
    nozzleReadings: [{ nozzleId: '00000000-0000-0000-0000-0000000000d1', closingReading: 10 }],
  });

const post = (role: string, userId?: string) =>
  handoverApp({ mountPath: '/shifts', router: shiftsRouter, role }).request('/shifts/handovers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body(userId),
  });

const OTHER = '00000000-0000-0000-0000-0000000000a2';
const SELF = SELF_USER_ID;

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
