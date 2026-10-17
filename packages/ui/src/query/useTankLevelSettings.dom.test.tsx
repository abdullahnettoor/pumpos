// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestQueryClient } from '../test/renderWithProviders.js';
import { queryKeys, useTankLevelSettings } from './hooks.js';

afterEach(cleanup);

describe('useTankLevelSettings (#520)', () => {
  it('reads the station thresholds from the stations cache and follows a save', async () => {
    const qc = createTestQueryClient();
    qc.setQueryData(queryKeys.stations(), [
      { id: 'st-1', settings: { tankLevels: { criticalBelowPct: 15, lowBelowPct: 35 } } },
      { id: 'st-2', settings: {} },
    ]);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const one = renderHook(() => useTankLevelSettings('st-1'), { wrapper });
    const two = renderHook(() => useTankLevelSettings('st-2'), { wrapper });
    expect(one.result.current).toEqual({ criticalBelowPct: 15, lowBelowPct: 35 });
    expect(two.result.current).toEqual({ criticalBelowPct: 25, lowBelowPct: 40 });

    act(() => {
      qc.setQueryData(queryKeys.stations(), [
        { id: 'st-1', settings: { tankLevels: { criticalBelowPct: 20, lowBelowPct: 50 } } },
      ]);
    });
    await waitFor(() =>
      expect(one.result.current).toEqual({ criticalBelowPct: 20, lowBelowPct: 50 }),
    );
  });
});
