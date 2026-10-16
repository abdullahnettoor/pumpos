import { describe, expect, it } from 'vitest';
import { undeclaredOperations } from '@pump/core';
import { registeredRoutes } from '../index.js';
import { WRITE_POLICY_DECLARATIONS } from './write-policy-declarations.js';
import { writePolicyOperationOf } from './write-policy-guard.js';

/**
 * Completeness of the Restricted Access matrix.
 *
 * The danger with a policy like this is not a wrong answer — a wrong answer
 * gets argued about and fixed. It is a *missing* answer: a mutation added
 * later that quietly inherits whatever the default is. Any default is wrong.
 * "Allow" lets an unpaid Organization keep growing; "block" strands a station
 * mid-shift.
 *
 * So the route table is read from the mounted app itself — every router and
 * every endpoint registered inline in `index.ts` (#626) — not from a list
 * someone has to remember to update, and every mutating route must have a
 * declaration and carry the guard that enforces it.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Tenant routes live under this mount; declarations are keyed without it. */
const TENANT_MOUNT = '/api';

/**
 * Mounts whose mutations are not tenant writes and so carry no Restricted
 * Access answer. Anything else outside `/api` is reported as undeclared.
 */
const EXEMPT_MOUNTS: Readonly<Record<string, string>> = {
  '/platform':
    'PumpOS platform administration. The caller is a platform admin acting on an ' +
    'Organization, not the Organization itself, so its access mode does not apply.',
};

interface MutatingRoute {
  /** `METHOD path` as declared — `/api` stripped for tenant routes. */
  operation: string;
  tenant: boolean;
  exempt: boolean;
}

function within(path: string, mount: string): boolean {
  return path === mount || path.startsWith(`${mount}/`);
}

/** Every mutating route on the app; one entry per Hono handler registered. */
function mutatingRouteEntries(): Array<MutatingRoute & { handler: unknown }> {
  const entries: Array<MutatingRoute & { handler: unknown }> = [];
  for (const route of registeredRoutes()) {
    // Hono registers middleware as ALL entries; only real handlers carry a
    // concrete method.
    if (!MUTATING.has(route.method)) continue;
    const tenant = within(route.path, TENANT_MOUNT);
    const path = tenant ? route.path.slice(TENANT_MOUNT.length) || '/' : route.path;
    entries.push({
      operation: `${route.method} ${path}`,
      tenant,
      exempt: Object.keys(EXEMPT_MOUNTS).some((mount) => within(route.path, mount)),
      handler: route.handler,
    });
  }
  return entries;
}

/** Every mutating operation that must declare an answer, as `METHOD path`. */
function mutatingOperations(): string[] {
  const operations = new Set<string>();
  for (const entry of mutatingRouteEntries()) {
    if (!entry.exempt) operations.add(entry.operation);
  }
  return [...operations].sort();
}

describe('the Restricted Access write-policy matrix', () => {
  it('declares an answer for every mutating route on the app, inline or routed', () => {
    const missing = undeclaredOperations(WRITE_POLICY_DECLARATIONS, mutatingOperations());

    expect(
      missing,
      `Undeclared mutations: ${missing.join(', ')}. Add each to write-policy-declarations.ts ` +
        'with an explicit Restricted Access answer — there is no safe default.',
    ).toEqual([]);
  });

  it('attaches writePolicyGuard, for its own declaration, to every declared route', () => {
    const guardedBy = new Map<string, Set<string>>();
    for (const entry of mutatingRouteEntries()) {
      const enforced = writePolicyOperationOf(entry.handler);
      if (!enforced) continue;
      const seen = guardedBy.get(entry.operation) ?? new Set<string>();
      seen.add(enforced);
      guardedBy.set(entry.operation, seen);
    }
    const unguarded = mutatingOperations().filter(
      (op) => op in WRITE_POLICY_DECLARATIONS && !guardedBy.get(op)?.has(op),
    );

    expect(
      unguarded,
      `Declared but not enforced: ${unguarded.join(', ')}. Add writePolicyGuard('<operation>') ` +
        "as the route's first middleware.",
    ).toEqual([]);
  });

  it('registers no mutation outside the tenant API or an exempt mount', () => {
    const stray = mutatingRouteEntries()
      .filter((entry) => !entry.tenant && !entry.exempt)
      .map((entry) => entry.operation);
    expect(stray, `Mutations outside ${TENANT_MOUNT}: ${stray.join(', ')}`).toEqual([]);
  });

  it('exempts only platform administration, never a tenant route', () => {
    const exempt = mutatingRouteEntries().filter((entry) => entry.exempt);
    expect(exempt.length).toBeGreaterThan(0);
    expect(exempt.filter((entry) => entry.tenant)).toEqual([]);
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
