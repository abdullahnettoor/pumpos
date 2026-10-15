// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { createTestQueryClient, renderWithProviders } from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { OrgProfile } from './OrgProfile.js';
import {
  __resetUnsavedChangesForTests,
  hasUnsavedChanges,
} from '../../pump-ds/form/unsavedChanges.js';

/** Organization › Profile is an in-page form with the unsaved-changes bar (#604). */

const ORG = {
  id: 'org-1',
  name: 'Sri Lakshmi Fuels',
  metadata: { legalName: 'Sri Lakshmi Fuels LLP', phone: '+91 98470 12345' },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetUnsavedChangesForTests();
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
    // Leaving now would ask first.
    expect(hasUnsavedChanges()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(input.value).toBe('+91 98470 12345'));
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('Discard renews the save key: an unsettled key is not reused for the next edit', async () => {
    const calls = setup();
    let attempt = 0;
    vi.mocked(fetch).mockImplementation(async (_i, init) => {
      if (init) calls.push(init);
      attempt += init?.method === 'PUT' || init?.method === 'PATCH' ? 1 : 0;
      if (attempt === 1 && (init?.method === 'PUT' || init?.method === 'PATCH'))
        return new Response('oops', { status: 503 });
      return new Response(JSON.stringify({ success: true, data: ORG }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await screen.findByDisplayValue('Sri Lakshmi Fuels');
    const key = () =>
      (
        calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH').at(-1)!.headers as Record<
          string,
          string
        >
      )['Idempotency-Key'];
    fireEvent.change(phone(), { target: { value: '+91 98470 00000' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(attempt).toBe(1));
    const first = key();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    fireEvent.change(phone(), { target: { value: '+91 98470 22222' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(attempt).toBe(2));
    expect(key()).not.toBe(first);
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

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('Organization profile (#605)', () => {
  it('is one column of Legal and Contact, with no letterhead preview (#615 review)', async () => {
    setup();
    await screen.findByDisplayValue('Sri Lakshmi Fuels');
    expect(screen.getByRole('group', { name: 'Legal' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Contact' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Letterhead preview' })).toBeNull();
  });

  it('fills the state code from the GSTIN, and leaves one typed by hand', async () => {
    setup();
    await screen.findByDisplayValue('Sri Lakshmi Fuels');
    fireEvent.change(field('GSTIN'), { target: { value: '32ABCDE1234F1Z9' } });
    expect(field('State code').value).toBe('32');
    fireEvent.change(field('GSTIN'), { target: { value: '29ABCDE1234F1ZW' } });
    expect(field('State code').value).toBe('29');
    fireEvent.change(field('State code'), { target: { value: '33' } });
    fireEvent.change(field('GSTIN'), { target: { value: '32ABCDE1234F1Z9' } });
    expect(field('State code').value).toBe('33');
  });

  it('refuses a malformed GSTIN or PAN without saving', async () => {
    const calls = setup();
    await screen.findByDisplayValue('Sri Lakshmi Fuels');
    fireEvent.change(field('GSTIN'), { target: { value: '32ABCDE12' } });
    fireEvent.change(field('PAN'), { target: { value: 'ABC1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('A GSTIN is 15 characters, like 29ABCDE1234F1ZW')).toBeTruthy();
    expect(screen.getByText('A PAN is 10 characters, like ABCDE1234F')).toBeTruthy();
    expect(calls.some((c) => c.method === 'PUT' || c.method === 'PATCH')).toBe(false);
  });
});
