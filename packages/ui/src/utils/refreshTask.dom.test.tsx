// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, muteExpectedConsoleErrors } from '../test/renderWithProviders.js';
import { REFRESH_FAILED_MS, useRefreshTask } from './runTask.js';

/** A failed refresh after a complete save (#606 owner decision): brief, with Retry. */
const Harness: React.FC<{ refresh: () => Promise<unknown> }> = ({ refresh }) => {
  const run = useRefreshTask();
  return (
    <button type="button" onClick={() => run(refresh, 'Expense recorded.')}>
      Save
    </button>
  );
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useRefreshTask', () => {
  it('says the save stands and the screen did not refresh, offers Retry, and leaves', async () => {
    const restore = muteExpectedConsoleErrors([/Expense recorded/]);
    try {
      const refresh = vi
        .fn<() => Promise<unknown>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined);
      renderWithProviders(<Harness refresh={refresh} />);

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      const toast = await screen.findByRole('alert');
      expect(toast.textContent).toContain("Expense recorded. Couldn't refresh the screen.");

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    } finally {
      restore();
    }
  });

  it('auto-dismisses', async () => {
    const restore = muteExpectedConsoleErrors([/Expense recorded/]);
    vi.useFakeTimers();
    try {
      renderWithProviders(<Harness refresh={() => Promise.reject(new Error('offline'))} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole('alert')).toBeDefined();
      act(() => vi.advanceTimersByTime(REFRESH_FAILED_MS + 1));
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      restore();
    }
  });
});
