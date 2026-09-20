import { describe, expect, it } from 'vitest';
import type { Role } from '@pump/shared';
import { stationSetupRouter } from './station-setup.js';
import { productsRouter } from './products.js';
import { paymentTerminalsRouter } from './payment-terminals.js';
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
 * Setup and administration under Restricted Access.
 *
 * An Organization that has stopped paying keeps its station running and keeps
 * reading its records, but stops growing: no new Stations, no new team
 * members, no catalog or infrastructure changes. Suspension goes further and
 * stops every write.
 *
 * These tests drive the real routers, so they prove the guard is actually
 * attached — the thing a unit test of the guard itself cannot show.
 */

const ROUTERS: ReadonlyArray<[string, any]> = [
  ['/setup', stationSetupRouter],
  ['/setup', productsRouter],
  ['/setup', paymentTerminalsRouter],
];

type Subscription = { status: string; accessUntil?: string | null };

/** One representative mutation per family the ticket covers. */
const BLOCKED_UNDER_RESTRICTED: ReadonlyArray<[string, string, string]> = [
  ['POST', '/setup/stations', 'Station onboarding'],
  ['PUT', '/setup/stations/station-1', 'Station configuration'],
  ['POST', '/setup/onboarding/finalize', 'Station provisioning'],
  ['POST', '/setup/tanks', 'infrastructure'],
  ['PUT', '/setup/tanks/tank-1', 'infrastructure edits'],
  ['DELETE', '/setup/tanks/tank-1', 'infrastructure removal'],
  ['POST', '/setup/dispensers', 'infrastructure'],
  ['POST', '/setup/nozzles', 'infrastructure'],
  ['POST', '/setup/shift-templates', 'shift structure'],
  ['POST', '/setup/users', 'team invitations'],
  ['PUT', '/setup/users/user-2', 'team administration'],
  ['POST', '/setup/users/user-2/reactivate', 'team reactivation'],
  ['POST', '/setup/users/user-2/reset-password', 'team administration'],
  ['POST', '/setup/products', 'catalog changes'],
  ['POST', '/setup/products/import', 'catalog import'],
  ['PUT', '/setup/products/product-1', 'catalog edits'],
  ['DELETE', '/setup/products/product-1', 'catalog removal'],
  ['POST', '/setup/payment-terminals', 'integration configuration'],
  ['PUT', '/setup/payment-terminals/terminal-1', 'integration configuration'],
  ['DELETE', '/setup/payment-terminals/terminal-1', 'integration removal'],
];

describe('setup and administration under Restricted Access', () => {
  it.each(BLOCKED_UNDER_RESTRICTED)('blocks %s %s (%s)', async (method, path) => {
    const result = await policyRequest(ROUTERS, method, path, { subscription: RESTRICTED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('blocks the same mutations once a Payment Grace Period has lapsed', async () => {
    // PAST_DUE past its window resolves as Restricted at request time; there
    // is no separate status to set and no job to run.
    const result = await policyRequest(ROUTERS, 'POST', '/setup/stations', {
      subscription: LAPSED_GRACE,
    });

    expect(result.status).toBe(403);
    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('still allows them during the Payment Grace Period', async () => {
    const result = await policyRequest(ROUTERS, 'POST', '/setup/stations', {
      subscription: {
        status: 'PAST_DUE',
        accessUntil: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('returns a refusal an operator can act on', async () => {
    const { body } = await policyRequest(ROUTERS, 'POST', '/setup/stations', {
      subscription: RESTRICTED,
      body: {},
    });

    expect(body.error).toMatchObject({
      code: 'SUBSCRIPTION_RESTRICTED',
      details: {
        operation: 'POST /setup/stations',
        resolution: 'COMPLETE_PAYMENT',
        actionLabel: 'Complete payment',
      },
    });
    // The copy has to say what still works, or the operator assumes the
    // station has stopped entirely.
    expect(body.error.message).toMatch(/finish open station work/i);
  });
});

describe('fuel pricing is an operation, not a setup change', () => {
  it('keeps working under Restricted Access', async () => {
    // Prices are published daily by the OMC and the pump keeps dispensing
    // regardless. Blocking the update would not stop trade — it would record
    // every later sale at the wrong price. (ADR 0004, Amendments.)
    const result = await policyRequest(ROUTERS, 'POST', '/setup/pricing', {
      subscription: RESTRICTED,
    });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('stops for a suspended Organization, like every other write', async () => {
    const result = await policyRequest(ROUTERS, 'POST', '/setup/pricing', {
      subscription: SUSPENDED,
    });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('a suspended Organization', () => {
  it.each([
    ['POST', '/setup/stations'],
    ['POST', '/setup/users'],
    ['POST', '/setup/products'],
    ['PUT', '/setup/payment-terminals/terminal-1'],
    ['POST', '/setup/pricing'],
  ])('cannot %s %s', async (method, path) => {
    const result = await policyRequest(ROUTERS, method, path, { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('Role authorization still runs', () => {
  it('refuses a Staff member with FORBIDDEN while access is normal', async () => {
    // Unchanged behaviour: the access policy is about the Organization, the
    // Role guard is about the person, and both still apply. A valid body, so
    // the request reaches the Role check rather than stopping at validation.
    const result = await policyRequest(ROUTERS, 'POST', '/setup/stations', {
      subscription: ACTIVE,
      role: 'Staff',
      body: { name: 'Second Station', code: 'ST2' },
    });

    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('reports the Organization-level refusal first when both would refuse', async () => {
    // Deliberate ordering: whether the Organization may act at all is decided
    // before who is asking. Either way the caller gets a 403 they cannot
    // retry, and this keeps the reason stable regardless of the Role.
    const result = await policyRequest(ROUTERS, 'POST', '/setup/stations', {
      subscription: RESTRICTED,
      role: 'Staff',
      body: { name: 'Second Station', code: 'ST2' },
    });

    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });
});

describe('the family is completely covered', () => {
  const { operations, unguarded } = guardCoverage(ROUTERS);

  it('declares every mutating route in setup, products and payment terminals', () => {
    expect(operations.filter((op) => !WRITE_POLICY_DECLARATIONS[op])).toEqual([]);
  });

  it('guards every one of them, not just the declared ones', () => {
    // A declaration with no guard attached is the failure this ticket exists
    // to prevent: the matrix would look complete while nothing enforced it.
    expect(unguarded).toEqual([]);
  });
});
