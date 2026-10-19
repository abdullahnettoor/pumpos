import { describe, expect, it } from 'vitest';
import { shiftsRouter } from './shifts.js';
import { transactionsRouter } from './transactions.js';
import { handoverApp } from './handover-route-fixture.js';

/**
 * #649: an Attendant handing over from their own phone is the
 * `handover.attendant_phone` Product Capability (Pro and Pro+). A manager
 * recording the same handover from the office works on every plan.
 */
const post = (role: string, plan: string) =>
  handoverApp({ mountPath: '/shifts', router: shiftsRouter, role, plan }).request(
    '/shifts/handovers',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId: '00000000-0000-0000-0000-0000000000b1',
        duId: '00000000-0000-0000-0000-0000000000c1',
        ...(role === 'Attendant' ? {} : { userId: '00000000-0000-0000-0000-0000000000a2' }),
        cashHandedOver: 100,
        nozzleReadings: [{ nozzleId: '00000000-0000-0000-0000-0000000000d1', closingReading: 10 }],
      }),
    },
  );

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

describe('Attendant merchandise handover capability (#649)', () => {
  const postMerch = (role: string, plan: string) =>
    handoverApp({
      mountPath: '/transactions',
      router: transactionsRouter,
      role,
      plan,
    }).request('/transactions/shifts/00000000-0000-0000-0000-0000000000b1/merchandise-handover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });

  it('Core refuses an Attendant', async () => {
    const res = await postMerch('Attendant', 'CORE');
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error.code).toBe('CAPABILITY_NOT_ENTITLED');
  });

  it.each(['PRO', 'PRO_PLUS'])('%s lets an Attendant through', async (plan) => {
    expect(await (await postMerch('Attendant', plan)).json()).toEqual({ reached: true });
  });

  it.each(['CORE', 'PRO', 'PRO_PLUS'])('%s lets a Manager through', async (plan) => {
    expect(await (await postMerch('Manager', plan)).json()).toEqual({ reached: true });
  });
});
