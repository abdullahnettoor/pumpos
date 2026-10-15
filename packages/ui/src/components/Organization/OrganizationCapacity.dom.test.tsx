/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { UNLIMITED_LIMIT, type AccessDocument } from '@pump/shared';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { OrganizationOverview } from './OrganizationOverview.js';
import { __resetUnsavedChangesForTests } from '../../pump-ds/form/unsavedChanges.js';

/**
 * Station capacity as the Owner sees it. The server decides who gets
 * commercial information — only Owners and Managers receive the plan key — so
 * the screen keys off that rather than re-deriving the Role, and the API
 * enforces the Limit regardless of what is rendered.
 */

afterEach(() => {
  cleanup();
  __resetUnsavedChangesForTests();
});

const document = (over: {
  plan?: 'CORE';
  used?: number;
  value?: number;
  reached?: boolean;
}): AccessDocument =>
  ({
    ...(over.plan ? { plan: over.plan } : {}),
    capabilities: {},
    limits: {
      station_count: {
        value: over.value ?? 1,
        used: over.used ?? 1,
        reached: over.reached ?? true,
      },
    },
    subscription: {
      status: 'ACTIVE',
      mode: 'NORMAL',
      accessUntil: null,
      showWarning: false,
      warningMessage: null,
    },
  }) as AccessDocument;

function renderOverview(access: AccessDocument | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (access) client.setQueryData(queryKeys.access(), access);
  return renderWithProviders(
    <OrganizationOverview
      stations={[]}
      selectedStation={null}
      onStationChange={() => {}}
      onNavigate={() => {}}
    />,
    { queryClient: client },
  );
}

const onboardButtons = () =>
  screen.getAllByRole('button', { name: /Onboard station/i }) as HTMLButtonElement[];

describe('Station usage on the Organization screen (#605: one line, no tiles)', () => {
  it('shows no KPI tiles', () => {
    renderOverview(document({ plan: 'CORE', used: 1, value: 3, reached: false }));

    expect(screen.queryByText('Stations on plan')).toBeNull();
    expect(screen.queryByText('Ready for operations')).toBeNull();
  });

  it('shows usage as one header line when the plan allows more than one station', () => {
    renderOverview(document({ plan: 'CORE', used: 1, value: 3, reached: false }));

    expect(screen.getByText('1 of 3 stations on your plan')).toBeTruthy();
    expect(onboardButtons().some((button) => button.disabled)).toBe(false);
  });

  it('counts an override-raised Limit, not just the plan value', () => {
    renderOverview(document({ plan: 'CORE', used: 4, value: 5, reached: false }));

    expect(screen.getByText('4 of 5 stations on your plan')).toBeTruthy();
  });

  it('says what to do at a reached Limit and disables the onboarding action', () => {
    renderOverview(document({ plan: 'CORE', used: 3, value: 3, reached: true }));

    expect(
      screen.getByText('3 of 3 stations on your plan · Contact PumpOS to add another'),
    ).toBeTruthy();
    expect(onboardButtons().every((button) => button.disabled)).toBe(true);
  });

  it('shows nothing on a one-station plan; the button still explains the Limit', () => {
    renderOverview(document({ plan: 'CORE', used: 1, value: 1, reached: true }));

    expect(screen.queryByText(/on your plan/)).toBeNull();
    const buttons = onboardButtons();
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons[0]!.title).toBe(
      'This plan includes one Station. Contact PumpOS to add another.',
    );
  });

  it('never prints the unlimited sentinel (#603)', () => {
    renderOverview(document({ plan: 'CORE', used: 1, value: UNLIMITED_LIMIT, reached: false }));

    expect(screen.queryByText(/on your plan/)).toBeNull();
    expect(screen.queryByText(/1000000|999999/)).toBeNull();
    expect(onboardButtons().some((button) => button.disabled)).toBe(false);
  });

  it('shows no commercial guidance to a Role the server withheld the plan from', () => {
    renderOverview(document({ used: 1, value: 3, reached: false }));

    expect(screen.queryByText(/on your plan/)).toBeNull();
  });

  it('shows no usage on a cold start and holds onboarding until access has loaded', () => {
    renderOverview(undefined);

    expect(screen.queryByText(/on your plan/)).toBeNull();
    // Absent access data means not yet (pump-access-gating).
    expect(onboardButtons().every((button) => button.disabled)).toBe(true);
  });
});

describe('One primary on Organization (#615 review)', () => {
  it('Add team member steps down while the Profile has unsaved changes', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(queryKeys.access(), document({ plan: 'CORE', used: 1, value: 3 }));
    client.setQueryData(queryKeys.organization(), {
      id: 'org-1',
      name: 'Sri Lakshmi Fuels',
      metadata: { phone: '+91 98470 12345' },
    });
    renderWithProviders(
      <OrganizationOverview
        stations={[]}
        selectedStation={null}
        onStationChange={() => {}}
        onNavigate={() => {}}
      />,
      { queryClient: client },
    );
    const add = () => screen.getByRole('button', { name: 'Add team member' });
    expect(add().className).toMatch('bg-brand');
    fireEvent.click(screen.getByRole('tab', { name: /Profile/ }));
    const phone = (await screen.findByDisplayValue('+91 98470 12345')) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '+91 98470 00000' } });
    await waitFor(() => expect(add().className).toMatch('border-border-strong'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(add().className).toMatch('bg-brand'));
  });
});
