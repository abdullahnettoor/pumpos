import { describe, expect, it } from 'vitest';
import type { Role } from '@pump/shared';
import { shiftsRouter } from './shifts.js';
import { WRITE_POLICY_DECLARATIONS } from '../infra/write-policy-declarations.js';
import {
  fakeAccessDb,
  guardCoverage,
  policyRequest,
  refusalsAcross,
  ACTIVE,
  IN_GRACE,
  LAPSED_GRACE,
  RESTRICTED,
  SUSPENDED,
} from './write-policy-harness.js';

/**
 * The Shift and Business Day lifecycle under Restricted Access.
 *
 * This is the family where getting it wrong does real damage. A station that
 * has fuel in its nozzles and cash in its drawer must be able to finish the
 * day — record readings, hand over, close the Shift, close the day — or its
 * stock and cash never reconcile and the operator is left with an unresolvable
 * mess. Restricted Access stops the *next* cycle, not the current one.
 *
 * Suspension is different: it is a security, legal, fraud or abuse stop, so it
 * takes precedence over finishing the day.
 */

const ROUTERS: ReadonlyArray<[string, any]> = [['/shifts', shiftsRouter]];

type Subscription = { status: string; accessUntil?: string | null };

/** The path a station must be able to walk to finish its day. */
const CLOSE_PATH: ReadonlyArray<[string, string, string]> = [
  ['PUT', '/shifts/readings', 'nozzle readings are how the Shift is reconciled'],
  ['POST', '/shifts/handovers', 'the attendant hands over cash and card takings'],
  ['POST', '/shifts/close', 'drawer accountability has to be settled'],
  ['POST', '/shifts/lock', 'sealing a closed Shift completes it'],
  ['POST', '/shifts/business-day/close', 'the day must be closable or stock never reconciles'],
];

const NEW_CYCLE: ReadonlyArray<[string, string, string]> = [
  ['POST', '/shifts/open', 'a new Shift is new work'],
  ['POST', '/shifts/business-day/open', 'a new Business Day starts new trading'],
  ['POST', '/shifts/reopen', 'reopening sealed work is an administrative correction'],
];

describe('finishing the current operating cycle under Restricted Access', () => {
  it.each(CLOSE_PATH)('allows %s %s — %s', async (method, path) => {
    const result = await policyRequest(ROUTERS, method, path, { subscription: RESTRICTED });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('walks the whole close path without a single access refusal', async () => {
    // End to end: the sequence an operator actually performs at end of day.
    // Any one of these refusing would strand the station mid-close.
    const refusals: string[] = [];
    for (const [method, path] of CLOSE_PATH) {
      const result = await policyRequest(ROUTERS, method, path, { subscription: RESTRICTED });
      if (result.code === 'SUBSCRIPTION_RESTRICTED') refusals.push(`${method} ${path}`);
    }

    expect(refusals).toEqual([]);
  });

  it('still allows the close path once a Payment Grace Period has lapsed', async () => {
    // The grace period ending is exactly when a station is most likely to be
    // mid-day; it must not trap them.
    const refusals: string[] = [];
    for (const [method, path] of CLOSE_PATH) {
      const result = await policyRequest(ROUTERS, method, path, { subscription: LAPSED_GRACE });
      if (result.code === 'SUBSCRIPTION_RESTRICTED') refusals.push(`${method} ${path}`);
    }

    expect(refusals).toEqual([]);
  });
});

describe('starting another cycle under Restricted Access', () => {
  it.each(NEW_CYCLE)('blocks %s %s — %s', async (method, path) => {
    const result = await policyRequest(ROUTERS, method, path, { subscription: RESTRICTED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('tells the operator what still works, so they do not assume everything stopped', async () => {
    const { body } = await policyRequest(ROUTERS, 'POST', '/shifts/open', {
      subscription: RESTRICTED,
      body: {},
    });

    expect(body.error).toMatchObject({
      code: 'SUBSCRIPTION_RESTRICTED',
      details: { operation: 'POST /shifts/open', resolution: 'COMPLETE_PAYMENT' },
    });
    expect(body.error.message).toMatch(/finish open station work/i);
  });
});

describe('a suspended Organization', () => {
  it.each([...CLOSE_PATH, ...NEW_CYCLE])('cannot %s %s', async (method, path) => {
    // Suspension outranks finishing the day: it is a security, legal, fraud or
    // abuse stop, not a billing state.
    const result = await policyRequest(ROUTERS, method, path, { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('the rest of the rules still decide', () => {
  it('leaves Role authorization in place once the access policy passes', async () => {
    // An Attendant may not open a Shift; that is unchanged and unrelated to
    // whether the Organization has paid.
    const result = await policyRequest(ROUTERS, 'POST', '/shifts/open', {
      subscription: { status: 'ACTIVE' },
      role: 'Attendant',
    });

    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('does not let a healthy subscription bypass anything else', async () => {
    // With access normal the request proceeds to the real handler, which
    // applies Station assignment, Day Seal and Shift lifecycle rules. It fails
    // here for its own reasons — never with an access-policy code.
    const result = await policyRequest(ROUTERS, 'POST', '/shifts/close', {
      subscription: { status: 'ACTIVE' },
      body: { shiftId: 'shift-1' },
    });

    expect(['SUBSCRIPTION_RESTRICTED', 'ORGANIZATION_SUSPENDED']).not.toContain(result.code);
  });
});

describe('the family is completely covered', () => {
  const { operations, unguarded } = guardCoverage(ROUTERS);

  it('declares every Shift and Business Day mutation', () => {
    expect(operations.filter((op) => !WRITE_POLICY_DECLARATIONS[op])).toEqual([]);
  });

  it('guards every one of them', () => {
    // A declaration with no guard attached would leave the matrix looking
    // complete while nothing enforced it.
    expect(unguarded).toEqual([]);
  });

  it('classifies each route the way the lifecycle requires', () => {
    expect(
      Object.fromEntries(operations.map((op) => [op, WRITE_POLICY_DECLARATIONS[op]?.restricted])),
    ).toEqual({
      'PUT /shifts/readings': 'FINISH_OPEN_WORK',
      'POST /shifts/handovers': 'FINISH_OPEN_WORK',
      'POST /shifts/close': 'FINISH_OPEN_WORK',
      'POST /shifts/lock': 'FINISH_OPEN_WORK',
      'POST /shifts/business-day/close': 'FINISH_OPEN_WORK',
      'POST /shifts/open': 'BLOCKED',
      'POST /shifts/reopen': 'BLOCKED',
      'POST /shifts/business-day/open': 'BLOCKED',
    });
  });
});
