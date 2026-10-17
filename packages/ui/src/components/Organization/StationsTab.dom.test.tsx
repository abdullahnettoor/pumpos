// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { Station } from '@pump/shared';
import { createTestQueryClient, renderWithProviders } from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { StationsTab } from './StationsTab.js';

/** Organization › Stations as cards (#605): facts from the cached lists, Configure / Switch. */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const station = (id: string, name: string, extra: Partial<Station> = {}) =>
  ({
    id,
    organizationId: 'org-1',
    name,
    code: id.toUpperCase(),
    address: 'NH 66, Kottakkal',
    onboardingStatus: 'READY_FOR_OPERATIONS',
    settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
    ...extra,
  }) as unknown as Station;

const ONE = station('st-1', 'Kottakkal');
const TWO = station('st-2', 'Tirur', { address: null } as unknown as Partial<Station>);

function setup(fail = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('down', { status: 503 })),
  );
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.stations(), [ONE, TWO]);
  if (!fail) {
    queryClient.setQueryData(queryKeys.tanks('st-1'), [{}, {}, { isActive: false }]);
    queryClient.setQueryData(queryKeys.dispensers('st-1'), [{}, {}, {}, {}]);
    queryClient.setQueryData(queryKeys.shiftStatus('st-1', true), {
      shift: { templateName: 'Morning', openedAt: '2026-10-15T00:30:00.000Z' },
    });
  }
  queryClient.setQueryData(queryKeys.tanks('st-2'), []);
  queryClient.setQueryData(queryKeys.dispensers('st-2'), []);
  queryClient.setQueryData(queryKeys.shiftStatus('st-2', true), { shift: null });
  const onStationChange = vi.fn();
  const onConfigure = vi.fn();
  renderWithProviders(
    <StationsTab
      stations={[ONE, TWO]}
      selectedStation={ONE}
      canSwitchStation
      onStationChange={onStationChange}
      onOnboard={() => {}}
      onboardGate={{ disabled: false }}
      onConfigure={onConfigure}
      onInviteTeam={() => {}}
    />,
    { queryClient },
  );
  return { onStationChange, onConfigure };
}

const card = (name: string) => screen.getByRole('region', { name });
const fact = (name: string, label: string) =>
  within(card(name)).getByText(label).nextElementSibling?.textContent;

describe('Station cards (#605)', () => {
  it('shows each station as a card with its facts and no KPI tiles', () => {
    setup();
    expect(screen.getAllByTestId('station-card')).toHaveLength(2);
    expect(screen.queryByText('Stations on plan')).toBeNull();
    expect(fact('Kottakkal', 'Tanks')).toBe('2');
    expect(fact('Kottakkal', 'Dispensers')).toBe('4');
    expect(fact('Kottakkal', 'Timezone')).toBe('Asia/Kolkata');
    expect(fact('Kottakkal', 'Day start')).toBe('6:00 am');
    expect(fact('Kottakkal', 'Open shift')).toBe('Morning, since 6:00\u00a0am');
    expect(fact('Tirur', 'Open shift')).toBe('None');
    expect(within(card('Tirur')).getByText('No address')).toBeTruthy();
  });

  it('marks the current station, which has no Switch', () => {
    setup();
    expect(within(card('Kottakkal')).getByText('Current station')).toBeTruthy();
    expect(within(card('Kottakkal')).queryByRole('button', { name: 'Switch' })).toBeNull();
    expect(within(card('Tirur')).queryByText('Current station')).toBeNull();
  });

  it('Switch and Configure name their station', () => {
    const { onStationChange, onConfigure } = setup();
    fireEvent.click(within(card('Tirur')).getByRole('button', { name: 'Switch' }));
    expect(onStationChange).toHaveBeenCalledWith(TWO);
    fireEvent.click(within(card('Tirur')).getByRole('button', { name: 'Configure Tirur' }));
    expect(onConfigure).toHaveBeenCalledWith(TWO);
  });

  it('a station whose facts fail to load says so in its card, with Retry', async () => {
    setup(true);
    expect(
      await within(card('Kottakkal')).findByText(/Couldn.t load station details/),
    ).toBeTruthy();
    expect(within(card('Kottakkal')).getByRole('button', { name: 'Retry' })).toBeTruthy();
    // The neighbour is unaffected.
    expect(fact('Tirur', 'Tanks')).toBe('0');
  });
});

describe('Stations header (#615 review)', () => {
  it('keeps the plan line whatever the filter', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.access(), {
      plan: 'CORE',
      capabilities: {},
      limits: { station_count: { value: 3, used: 2, reached: false } },
      subscription: { status: 'ACTIVE', mode: 'NORMAL' },
    });
    const setup = station('st-2', 'Tirur', { onboardingStatus: 'IN_PROGRESS' } as Partial<Station>);
    queryClient.setQueryData(queryKeys.stations(), [ONE, setup]);
    renderWithProviders(
      <StationsTab
        stations={[ONE, setup]}
        selectedStation={ONE}
        canSwitchStation
        onStationChange={() => {}}
        onOnboard={() => {}}
        onboardGate={{ disabled: false }}
        onConfigure={() => {}}
        onInviteTeam={() => {}}
      />,
      { queryClient },
    );
    expect(screen.getByText('2 of 3 stations on your plan')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /In setup/ }));
    expect(screen.getByText('2 of 3 stations on your plan')).toBeTruthy();
    expect(screen.getAllByTestId('station-card')).toHaveLength(1);
  });

  it('shows logins used against the limit beside Stations (#648)', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.access(), {
      plan: 'CORE',
      capabilities: {},
      limits: {
        station_count: { value: 3, used: 2, reached: false },
        login_count: { value: 10, used: 4, reached: false },
      },
      subscription: { status: 'ACTIVE', mode: 'NORMAL' },
    });
    queryClient.setQueryData(queryKeys.stations(), [ONE]);
    renderWithProviders(
      <StationsTab
        stations={[ONE]}
        selectedStation={ONE}
        canSwitchStation
        onStationChange={() => {}}
        onOnboard={() => {}}
        onboardGate={{ disabled: false }}
        onConfigure={() => {}}
        onInviteTeam={() => {}}
      />,
      { queryClient },
    );
    expect(screen.getByText('2 of 3 stations on your plan · 4 of 10 logins')).toBeTruthy();
  });
});
