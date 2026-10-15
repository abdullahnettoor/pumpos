// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { createTestQueryClient, renderWithProviders } from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { OrgProfile } from './OrgProfile.js';

/** Organization › Profile is an in-page form with the unsaved-changes bar (#604). */

const ORG = {
  id: 'org-1',
  name: 'Sri Lakshmi Fuels',
  metadata: { legalName: 'Sri Lakshmi Fuels LLP', phone: '+91 98470 12345' },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const calls: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init) calls.push(init);
      return new Response(JSON.stringify({ success: true, data: ORG }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.organization(), ORG);
  renderWithProviders(<OrgProfile />, { queryClient });
  return calls;
}

const phone = () => screen.getByDisplayValue('+91 98470 12345') as HTMLInputElement;

describe('Organization profile (#604)', () => {
  it('has no Save until a field changes; Discard puts the saved details back', async () => {
    setup();
    await screen.findByDisplayValue('Sri Lakshmi Fuels');
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();

    const input = phone();
    fireEvent.change(input, { target: { value: '+91 98470 00000' } });
    expect(await screen.findByRole('region', { name: 'Unsaved changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(input.value).toBe('+91 98470 12345'));
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });

  it('saves under an Idempotency-Key and the bar goes away at once', async () => {
    const calls = setup();
    await screen.findByDisplayValue('Sri Lakshmi Fuels');
    fireEvent.change(phone(), { target: { value: '+91 98470 00000' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'PUT' || c.method === 'PATCH')).toBe(true),
    );
    const save = calls.find((c) => c.method === 'PUT' || c.method === 'PATCH')!;
    expect((save.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull(),
    );
  });
});
