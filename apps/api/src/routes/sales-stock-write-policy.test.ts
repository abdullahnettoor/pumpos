import { describe, expect, it } from 'vitest';
import type { Role } from '@pump/shared';
import { transactionsRouter } from './transactions.js';
import { dssrRouter } from './dssr.js';
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
 * Sales, stock and reporting under Restricted Access.
 *
 * The fuel has already left the tank and the money has already changed hands
 * by the time PumpOS hears about it. Refusing to record that does not undo it;
 * it just means the Business Day cannot be closed and the variance can never
 * be explained. So everything that describes work already done stays open —
 * sales, purchases, stock counts, handovers, invoices, the DSSR — while
 * anything that starts new work is handled by the other families.
 */

const ROUTERS: ReadonlyArray<[string, any]> = [
  ['/transactions', transactionsRouter],
  ['/dssr', dssrRouter],
];

type Subscription = { status: string; accessUntil?: string | null };

/** Recording work that has already physically happened. */
const RECORDING: ReadonlyArray<[string, string, string]> = [
  ['POST', '/transactions/sales', 'the fuel or goods have already left'],
  ['POST', '/transactions/purchases', 'the tanker has already been decanted'],
  ['POST', '/transactions/inventory/count', 'the dip reading explains the day’s variance'],
  [
    'POST',
    '/transactions/shifts/shift-1/merchandise-handover',
    'the attendant already holds the cash',
  ],
  ['POST', '/transactions/sales/sale-1/invoice', 'the customer is entitled to their invoice'],
  ['DELETE', '/transactions/merchandise-handovers/sale-1', 'correcting a mis-keyed handover'],
  ['DELETE', '/transactions/credit-sales/sale-1', 'correcting a mis-keyed credit sale'],
  ['DELETE', '/transactions/omc-card-sales/sale-1', 'correcting a mis-keyed card sale'],
  ['POST', '/dssr/daily/generate', 'the DSSR is the closing snapshot of the day'],
];

describe('recording completed work under Restricted Access', () => {
  it.each(RECORDING)('allows %s %s — %s', async (method, path) => {
    const result = await policyRequest(ROUTERS, method, path, { subscription: RESTRICTED });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('lets a full day of trade be recorded and reported without one refusal', async () => {
    // The workflow end to end: sell, take a delivery, count stock, settle the
    // attendant, then produce the day's report.
    const workflow: ReadonlyArray<[string, string]> = [
      ['POST', '/transactions/sales'],
      ['POST', '/transactions/purchases'],
      ['POST', '/transactions/inventory/count'],
      ['POST', '/transactions/shifts/shift-1/merchandise-handover'],
      ['POST', '/dssr/daily/generate'],
    ];
    const refusals: string[] = [];
    for (const [method, path] of workflow) {
      const result = await policyRequest(ROUTERS, method, path, { subscription: RESTRICTED });
      if (result.code === 'SUBSCRIPTION_RESTRICTED') refusals.push(`${method} ${path}`);
    }

    expect(refusals).toEqual([]);
  });

  it('keeps recording open once the Payment Grace Period has lapsed', async () => {
    const result = await policyRequest(ROUTERS, 'POST', '/transactions/sales', {
      subscription: LAPSED_GRACE,
    });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });
});

describe('a suspended Organization', () => {
  it.each(RECORDING)('cannot %s %s', async (method, path) => {
    const result = await policyRequest(ROUTERS, method, path, { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('the rest of the rules still decide', () => {
  it('never yields an access-policy code while the subscription is healthy', async () => {
    // Business Day anchoring, Day Seal, stock movement and Role rules run in
    // the handler exactly as before; the request fails there on its own terms.
    const result = await policyRequest(ROUTERS, 'POST', '/transactions/sales', {
      subscription: { status: 'ACTIVE' },
    });

    expect(['SUBSCRIPTION_RESTRICTED', 'ORGANIZATION_SUSPENDED']).not.toContain(result.code);
  });
});

describe('this family is completely covered', () => {
  const OPERATIONS = RECORDING.map(
    ([method, path]) =>
      // Route patterns, not the concrete ids used to drive the requests above.
      `${method} ${path
        .replace('/sale-1/invoice', '/:id/invoice')
        .replace('/shifts/shift-1/', '/shifts/:id/')
        .replace('/merchandise-handovers/sale-1', '/merchandise-handovers/:saleId')
        .replace('/credit-sales/sale-1', '/credit-sales/:id')
        .replace('/omc-card-sales/sale-1', '/omc-card-sales/:id')}`,
  );

  it('declares every route in the assigned family', () => {
    const missing = OPERATIONS.filter((op) => !WRITE_POLICY_DECLARATIONS[op]);

    expect(missing).toEqual([]);
  });

  it('classifies all of them as finishing open work', () => {
    const wrong = OPERATIONS.filter(
      (op) => WRITE_POLICY_DECLARATIONS[op]?.restricted !== 'FINISH_OPEN_WORK',
    );

    expect(wrong).toEqual([]);
  });

  it('guards every one of them', () => {
    const routes = [
      ...transactionsRouter.routes.map((r) => `${r.method} /transactions${r.path}`),
      ...dssrRouter.routes.map((r) => `${r.method} /dssr${r.path}`),
    ];
    const unguarded = OPERATIONS.filter(
      (op) => routes.filter((candidate) => candidate === op).length < 2,
    );

    expect(unguarded).toEqual([]);
  });
});
