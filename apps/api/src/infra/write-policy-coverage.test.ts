import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { undeclaredOperations } from '@pump/core';
import { dssrRouter } from '../routes/dssr.js';
import { financeRouter } from '../routes/finance.js';
import { paymentTerminalsRouter } from '../routes/payment-terminals.js';
import { productsRouter } from '../routes/products.js';
import { shiftsRouter } from '../routes/shifts.js';
import { stationSetupRouter } from '../routes/station-setup.js';
import { transactionsRouter } from '../routes/transactions.js';
import { WRITE_POLICY_DECLARATIONS } from './write-policy-declarations.js';

/**
 * Completeness of the Restricted Access matrix.
 *
 * The danger with a policy like this is not a wrong answer — a wrong answer
 * gets argued about and fixed. It is a *missing* answer: a mutation added
 * later that quietly inherits whatever the default is. Any default is wrong.
 * "Allow" lets an unpaid Organization keep growing; "block" strands a station
 * mid-shift.
 *
 * So the route table is read from the routers themselves, not from a list
 * someone has to remember to update, and every mutating route must have a
 * declaration.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Mount prefixes, mirroring `app.route(...)` in index.ts. */
const MOUNTED: ReadonlyArray<[string, Hono<any>]> = [
  ['/setup', stationSetupRouter as Hono<any>],
  ['/setup', paymentTerminalsRouter as Hono<any>],
  ['/setup', productsRouter as Hono<any>],
  ['/shifts', shiftsRouter as Hono<any>],
  ['/transactions', transactionsRouter as Hono<any>],
  ['/dssr', dssrRouter as Hono<any>],
  ['/finance', financeRouter as Hono<any>],
];

/** Every mutating operation the tenant API exposes, as `METHOD path`. */
function mutatingOperations(): string[] {
  const operations = new Set<string>();
  for (const [prefix, router] of MOUNTED) {
    for (const route of router.routes) {
      if (!MUTATING.has(route.method)) continue;
      // Hono registers middleware as ALL/use entries too; only real handlers
      // carry a concrete method.
      operations.add(`${route.method} ${prefix}${route.path === '/' ? '' : route.path}`);
    }
  }
  return [...operations].sort();
}

describe('the Restricted Access write-policy matrix', () => {
  it('declares an answer for every mutating tenant route', () => {
    const missing = undeclaredOperations(WRITE_POLICY_DECLARATIONS, mutatingOperations());

    expect(
      missing,
      `Undeclared mutations: ${missing.join(', ')}. Add each to write-policy-declarations.ts ` +
        'with an explicit Restricted Access answer — there is no safe default.',
    ).toEqual([]);
  });

  it('covers a real, non-trivial number of routes (the enumeration still works)', () => {
    // Guards against the enumeration silently returning nothing — which would
    // make the test above pass for the wrong reason.
    expect(mutatingOperations().length).toBeGreaterThan(50);
  });

  it('declares nothing that is not a route, so the matrix cannot rot', () => {
    const live = new Set(mutatingOperations());
    const stale = Object.keys(WRITE_POLICY_DECLARATIONS).filter((op) => !live.has(op));

    expect(stale, `Declarations with no matching route: ${stale.join(', ')}`).toEqual([]);
  });

  it('gives every declaration a rationale, because the reasoning is the artefact', () => {
    const unexplained = Object.values(WRITE_POLICY_DECLARATIONS)
      .filter((d) => d.rationale.trim().length < 20)
      .map((d) => d.operation);

    expect(unexplained).toEqual([]);
  });

  it('keeps the day closable: the close path is never blocked', () => {
    // The one property Restricted Access must never break — an open Business
    // Day has to be finishable, or stock and cash never reconcile.
    for (const operation of [
      'PUT /shifts/readings',
      'POST /shifts/handovers',
      'POST /shifts/close',
      'POST /shifts/business-day/close',
      'POST /dssr/daily/generate',
    ]) {
      expect(WRITE_POLICY_DECLARATIONS[operation]?.restricted).toBe('FINISH_OPEN_WORK');
    }
  });

  it('blocks growth: new Shifts, new Stations and invitations', () => {
    for (const operation of [
      'POST /shifts/open',
      'POST /shifts/business-day/open',
      'POST /setup/stations',
      'POST /setup/onboarding/finalize',
      'POST /setup/users',
    ]) {
      expect(WRITE_POLICY_DECLARATIONS[operation]?.restricted).toBe('BLOCKED');
    }
  });
});
