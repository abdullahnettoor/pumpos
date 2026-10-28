// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

/**
 * The three-shift pre-fill (#591). It used to send one request per shift, so a
 * failure on the second or third left a partial set, and the next click added
 * the first shift again. Now it is one all-or-nothing request, and a retry
 * after a dropped connection reuses its key.
 */
const createTemplates = vi.fn();
const createTemplate = vi.fn();
const invalidateOperational = vi.fn(() => Promise.resolve());

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudShiftTemplateService: class {
    createTemplates = (...a: unknown[]) => createTemplates(...a);
    createTemplate = (...a: unknown[]) => createTemplate(...a);
  },
}));

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShiftTemplates: () => ({ data: [], isPending: false }),
  useInvalidateOperational: () => invalidateOperational,
}));

const { ShiftTemplates } = await import('./ShiftTemplates.js');

const prefill = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Pre-fill default shifts' }));

describe('ShiftTemplates — pre-filling the default shifts', () => {
  afterEach(() => {
    cleanup();
    createTemplates.mockReset();
    createTemplate.mockReset();
    invalidateOperational.mockReset().mockResolvedValue(undefined);
  });

  it('creates all three shifts in one keyed request', async () => {
    createTemplates.mockResolvedValue([]);
    renderWithProviders(<ShiftTemplates />);
    prefill();

    await waitFor(() => expect(createTemplates).toHaveBeenCalledTimes(1));
    expect(createTemplates).toHaveBeenCalledWith(
      [
        { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', isActive: true },
        { name: 'Evening Shift', startTime: '14:00', endTime: '22:00', isActive: true },
        { name: 'Night Shift', startTime: '22:00', endTime: '06:00', isActive: true },
      ],
      { idempotencyKey: expect.any(String) },
    );
    expect(createTemplate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Default shifts created.')).toBeDefined());
    // Shift open reads templates through shift status, an operational query.
    expect(invalidateOperational).toHaveBeenCalledTimes(1);
  });

  it('retries a dropped pre-fill under the same key', async () => {
    createTemplates.mockRejectedValueOnce(new Error('Network down')).mockResolvedValueOnce([]);
    renderWithProviders(<ShiftTemplates />);
    prefill();
    await waitFor(() => expect(screen.getByText(/Network down/i)).toBeDefined());
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Pre-fill default shifts' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    prefill();

    await waitFor(() => expect(createTemplates).toHaveBeenCalledTimes(2));
    const keyOf = (n: number) =>
      (createTemplates.mock.calls[n][1] as { idempotencyKey: string }).idempotencyKey;
    expect(keyOf(1)).toBe(keyOf(0));
  });
});
