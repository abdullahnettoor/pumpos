/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from '../../query/queryClient.js';
import { queryKeys } from '../../query/hooks.js';
import { ToastProvider } from '../primitives/ToastProvider.js';
import { calendarDay, datePicker } from '../../test/datePicker.js';
import { SupplierFormDrawer } from './SupplierFormDrawer.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SupplierFormDrawer opening balance date (#609)', () => {
  it("is picked from a calendar that ends on the station's today, not this device's", () => {
    // 12:00 UTC on 14 Oct is already 15 Oct at a UTC+14 station.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.stations(), [
      { id: 'st-1', settings: { timezone: 'Pacific/Kiritimati' } },
    ]);
    render(
      <QueryProvider client={client}>
        <ToastProvider>
          <SupplierFormDrawer isOpen editingSupplier={null} stationId="st-1" onClose={() => {}} />
        </ToastProvider>
      </QueryProvider>,
    );
    expect(document.querySelector('input[type="date"]')).toBeNull();
    fireEvent.click(datePicker('Opening due as of'));
    expect(calendarDay('2026-10-15')?.disabled).toBe(false);
    expect(calendarDay('2026-10-16')?.disabled).toBe(true);
  });
});
