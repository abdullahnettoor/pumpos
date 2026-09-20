/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type { AccessDocument } from '@pump/shared';
import { QueryProvider } from '../../query/queryClient.js';
import { queryKeys } from '../../query/hooks.js';
import { OrganizationOverview } from './OrganizationOverview.js';

/**
 * Station capacity as the Owner sees it. The server decides who gets
 * commercial information — only Owners and Managers receive the plan key — so
 * the screen keys off that rather than re-deriving the Role, and the API
 * enforces the Limit regardless of what is rendered.
 */

afterEach(cleanup);

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
  return render(
    <QueryProvider client={client}>
      <OrganizationOverview
        stations={[]}
        selectedStation={null}
        onStationChange={() => {}}
        onNavigate={() => {}}
      />
    </QueryProvider>,
  );
}

const onboardButtons = () =>
  screen.getAllByRole('button', { name: /Onboard station/i }) as HTMLButtonElement[];

describe('Station usage on the Organization screen', () => {
  it('shows usage against the Limit to a Role that receives the plan', () => {
    renderOverview(document({ plan: 'CORE', used: 1, value: 1 }));

    expect(screen.getByText('1 of 1 used')).toBeTruthy();
  });

  it('explains a reached Limit and disables the onboarding action', () => {
    renderOverview(document({ plan: 'CORE', used: 1, value: 1, reached: true }));

    expect(
      screen.getByText('This plan includes one Station. Contact PumpOS to add another.'),
    ).toBeTruthy();
    expect(onboardButtons().every((button) => button.disabled)).toBe(true);
  });

  it('leaves onboarding available while capacity remains', () => {
    renderOverview(document({ plan: 'CORE', used: 1, value: 3, reached: false }));

    expect(screen.getByText('1 of 3 used')).toBeTruthy();
    expect(screen.queryByText(/Contact PumpOS/)).toBeNull();
    expect(onboardButtons().some((button) => button.disabled)).toBe(false);
  });

  it('counts an override-raised Limit, not just the plan value', () => {
    renderOverview(document({ plan: 'CORE', used: 4, value: 5, reached: false }));

    expect(screen.getByText('4 of 5 used')).toBeTruthy();
  });

  it('shows no commercial guidance to a Role the server withheld the plan from', () => {
    renderOverview(document({ used: 1, value: 1, reached: true }));

    expect(screen.queryByText('1 of 1 used')).toBeNull();
  });

  it('shows nothing on a cold start and keeps onboarding usable', () => {
    renderOverview(undefined);

    expect(screen.queryByText(/of 1 used/)).toBeNull();
    expect(onboardButtons().some((button) => button.disabled)).toBe(false);
  });
});
