import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInvalidateOperational, queryKeys } from './hooks.js';

/**
 * Operational caches must not survive the write that moved them. A shift
 * closes, a handover is corrected, a sale is recorded — anything an operator
 * does next must read the new truth, not the pre-write snapshot.
 *
 * This asserts the keys an operational write invalidates. It is a list that
 * grows silently wrong: a new operational query added without a matching
 * invalidation shows same-session stale data, which in a package that reports
 * attendant variance is money-visible.
 */

function invalidatedKeysAfterOperationalWrite(): string[] {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidated: string[] = [];
  const original = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((filters?: { queryKey?: readonly unknown[] }) => {
    const key = filters?.queryKey?.[0];
    if (typeof key === 'string') invalidated.push(key);
    return original(filters as never);
  }) as typeof client.invalidateQueries;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useInvalidateOperational(), { wrapper });
  result.current('station-1');
  return invalidated;
}

describe('useInvalidateOperational', () => {
  it('refreshes the Attendant Handover Report, which reads closed-shift handovers', () => {
    // Closing or correcting a shift changes this report; without the
    // invalidation an operator keeps seeing the pre-close variance.
    expect(invalidatedKeysAfterOperationalWrite()).toContain(
      queryKeys.attendantHandoverReport('station-1', '2026-03-01', '2026-03-31')[0],
    );
  });

  it('refreshes the shift, day and summary caches a write moves', () => {
    const keys = invalidatedKeysAfterOperationalWrite();
    for (const key of ['shift-status', 'business-day-status', 'shift-summaries', 'dssr-preview']) {
      expect(keys).toContain(key);
    }
  });
});
