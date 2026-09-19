import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { capabilityEnabled, type AccessDocument } from '@pump/shared';
import { queryKeys, TIER } from './hooks.js';

/**
 * Access is presentation data with two honest failure modes (Phase E1):
 * a warm client keeps working through an outage, and a cold client hides
 * optional capabilities rather than inventing access.
 */

const document = (over: Partial<AccessDocument> = {}): AccessDocument => ({
  plan: 'CORE',
  capabilities: {
    'exports.tally': { enabled: true, title: 'Tally export' },
  },
  limits: { station_count: { value: 1, used: 1, reached: true } },
  subscription: {
    status: 'ACTIVE',
    mode: 'NORMAL',
    accessUntil: null,
    showWarning: false,
    warningMessage: null,
  },
  ...over,
});

describe('capabilityEnabled', () => {
  it('reports an enabled capability', () => {
    expect(capabilityEnabled(document(), 'exports.tally')).toBe(true);
  });

  it('hides a capability the document does not enable', () => {
    const doc = document({
      capabilities: {
        'exports.tally': {
          enabled: false,
          title: 'Tally export',
          visibility: 'UPGRADE',
          unavailableMessage: 'Not available.',
          resolution: 'CONTACT_PUMPOS',
        },
      },
    });
    expect(capabilityEnabled(doc, 'exports.tally')).toBe(false);
  });

  it('hides everything on a cold start with no Access Document', () => {
    expect(capabilityEnabled(undefined, 'exports.tally')).toBe(false);
  });

  it('hides a capability this Role was never sent', () => {
    expect(capabilityEnabled(document({ capabilities: {} }), 'exports.tally')).toBe(false);
  });
});

describe('the access query', () => {
  it('is cached under one centralized key', () => {
    expect(queryKeys.access()).toEqual(['access']);
  });

  it('keeps serving the warm document when a refetch fails offline', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.access(), document());

    await client
      .fetchQuery({
        queryKey: queryKeys.access(),
        queryFn: () => Promise.reject(new Error('Failed to fetch')),
        ...TIER.semi,
        staleTime: 0,
      })
      .catch(() => undefined);

    const cached = client.getQueryData<AccessDocument>(queryKeys.access());
    expect(capabilityEnabled(cached, 'exports.tally')).toBe(true);
  });
});
