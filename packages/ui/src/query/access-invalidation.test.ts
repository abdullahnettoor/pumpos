import { describe, expect, it } from 'vitest';
import type { AccessDocument } from '@pump/shared';
import { isAccessPolicyError } from '@pump/shared';
import { createQueryClient } from './queryClient.js';
import { queryKeys } from './hooks.js';

/**
 * When the server refuses on access grounds, the client's Access Document is
 * by definition stale — the grant it was offering has gone, or a Limit moved.
 * Refetching it is what stops the UI from continuing to offer something the
 * server now rejects.
 */

const document: AccessDocument = {
  plan: 'CORE',
  capabilities: { 'exports.tally': { enabled: true, title: 'Tally export' } },
  limits: { station_count: { value: 1, used: 0, reached: false } },
  subscription: {
    status: 'ACTIVE',
    mode: 'NORMAL',
    accessUntil: null,
    showWarning: false,
    warningMessage: null,
    resolution: null,
  },
};

const apiError = (code: string) => Object.assign(new Error('refused'), { code });

describe('isAccessPolicyError', () => {
  it.each(['CAPABILITY_NOT_ENTITLED', 'LIMIT_REACHED'])('recognizes %s', (code) => {
    expect(isAccessPolicyError(apiError(code))).toBe(true);
  });

  it.each(['FORBIDDEN', 'VALIDATION_ERROR', 'CONFLICT', 'RESOURCE_LIMIT'])(
    'leaves %s alone — not an access-policy rejection',
    (code) => {
      expect(isAccessPolicyError(apiError(code))).toBe(false);
    },
  );

  it('tolerates a non-API failure such as a network error', () => {
    expect(isAccessPolicyError(new Error('Failed to fetch'))).toBe(false);
    expect(isAccessPolicyError(undefined)).toBe(false);
  });
});

describe('the query client on an access-policy rejection', () => {
  /** Refetch the access query and report whether the queryFn ran again. */
  async function refuseWith(code: string): Promise<{ refetched: boolean }> {
    const client = createQueryClient();
    let fetches = 0;
    client.setQueryData(queryKeys.access(), document);

    await client
      .fetchQuery({
        queryKey: ['exports', 'tally'],
        queryFn: () => Promise.reject(apiError(code)),
        retry: false,
      })
      .catch(() => undefined);

    // An invalidated query refetches on its next observation; fetching it here
    // stands in for the component that would re-render.
    await client.fetchQuery({
      queryKey: queryKeys.access(),
      queryFn: () => {
        fetches += 1;
        return Promise.resolve(document);
      },
      staleTime: Infinity,
    });

    return { refetched: fetches === 1 };
  }

  it('invalidates the cached Access Document', async () => {
    expect((await refuseWith('CAPABILITY_NOT_ENTITLED')).refetched).toBe(true);
  });

  it('invalidates it when a Limit is reported as reached', async () => {
    expect((await refuseWith('LIMIT_REACHED')).refetched).toBe(true);
  });

  it('leaves the document alone for an ordinary failure', async () => {
    // A Role refusal or a validation error says nothing about Organization
    // access, so re-fetching it would be pure noise.
    expect((await refuseWith('FORBIDDEN')).refetched).toBe(false);
  });

  it('keeps serving the cached document while the refetch is in flight', async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.access(), document);

    await client
      .fetchQuery({
        queryKey: ['exports', 'tally'],
        queryFn: () => Promise.reject(apiError('CAPABILITY_NOT_ENTITLED')),
        retry: false,
      })
      .catch(() => undefined);

    // Invalidation marks the entry stale; it does not blank the UI.
    expect(client.getQueryData<AccessDocument>(queryKeys.access())).toEqual(document);
  });
});
