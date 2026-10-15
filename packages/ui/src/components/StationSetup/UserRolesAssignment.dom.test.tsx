// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  createTestQueryClient,
  muteExpectedConsoleErrors,
  renderWithProviders,
} from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { CloudUserAssignmentService } from '../../services/cloud.js';
import { UserRolesAssignment, defaultNewMemberStationIds } from './UserRolesAssignment.js';
import { MemberDrawer } from './TeamMemberDrawers.js';

const ST_A = { id: 'st-a', name: 'Kochi', code: 'KOC' };
const ST_B = { id: 'st-b', name: 'Thrissur', code: 'TCR' };

/** A new member's drawer, as the page's "Add team member" opens it. */
const renderTeam = (stations: any[], currentStationId: string | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.users(), []);
  queryClient.setQueryData(queryKeys.stations(), stations);
  renderWithProviders(
    <MemberDrawer
      isOpen
      editingUser={null}
      currentStationId={currentStationId}
      onClose={() => {}}
    />,
    { queryClient },
  );
};
const stationBox = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('defaultNewMemberStationIds (#299)', () => {
  it('picks the current station, else the only one, else none', () => {
    expect(defaultNewMemberStationIds([ST_A, ST_B], 'st-b')).toEqual(['st-b']);
    expect(defaultNewMemberStationIds([ST_A], null)).toEqual(['st-a']);
    expect(defaultNewMemberStationIds([ST_A, ST_B], null)).toEqual([]);
    expect(defaultNewMemberStationIds([ST_A, ST_B], 'gone')).toEqual([]);
  });
});

describe('New Team Member form', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = muteExpectedConsoleErrors([/not wrapped in act/]);
  });
  afterEach(() => {
    cleanup();
    restore();
    vi.restoreAllMocks();
  });

  it('pre-checks the current station, and it can be unchecked (#299)', () => {
    renderTeam([ST_A, ST_B], 'st-b');
    expect(stationBox('Thrissur (TCR)').checked).toBe(true);
    expect(stationBox('Kochi (KOC)').checked).toBe(false);
    fireEvent.click(stationBox('Thrissur (TCR)'));
    expect(stationBox('Thrissur (TCR)').checked).toBe(false);
  });

  it('pre-checks the only station of a one-station organization (#299)', () => {
    renderTeam([ST_A], null);
    expect(stationBox('Kochi (KOC)').checked).toBe(true);
  });

  it('shows an inline error for an invalid mobile and does not save (#300)', async () => {
    const create = vi.spyOn(CloudUserAssignmentService.prototype, 'createUser');
    renderTeam([ST_A], null);
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), {
      target: { value: 'Ravi Kumar' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 98765 43210'), {
      target: { value: '12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(await screen.findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows an inline error when phone login has no phone (#300)', async () => {
    renderTeam([ST_A], null);
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), {
      target: { value: 'Ravi Kumar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(await screen.findByText('A phone number is required for phone login.')).toBeTruthy();
  });

  it('sends the one stored spelling for a valid mobile (#300)', async () => {
    const create = vi
      .spyOn(CloudUserAssignmentService.prototype, 'createUser')
      .mockResolvedValue({ id: 'u-new' } as any);
    renderTeam([ST_A], null);
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), {
      target: { value: 'Ravi Kumar' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 98765 43210'), {
      target: { value: '098765 43210' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'Secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      phone: '+919876543210',
      stationIds: ['st-a'],
    });
  });
});

describe('Team submit keys (#538)', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = muteExpectedConsoleErrors([/not wrapped in act/]);
  });
  afterEach(() => {
    cleanup();
    restore();
    vi.restoreAllMocks();
  });

  const network = Object.assign(new Error('offline'), { code: 'NETWORK' });

  /** Opens a fresh new-member drawer, fills a phone login for `name`, and saves. */
  const addMember = async (name: string, phone: string) => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.users(), []);
    queryClient.setQueryData(queryKeys.stations(), [ST_A]);
    renderWithProviders(
      <MemberDrawer isOpen editingUser={null} currentStationId={null} onClose={() => {}} />,
      { queryClient },
    );
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 98765 43210'), {
      target: { value: phone },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'Secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
  };

  it('a different member in a new drawer gets a new key; the same one recovers it', async () => {
    const keys: (string | undefined)[] = [];
    const create = vi
      .spyOn(CloudUserAssignmentService.prototype, 'createUser')
      .mockImplementation(async (_body, opts) => {
        keys.push(opts?.idempotencyKey);
        if (keys.length === 1) throw network;
        return { id: `u-${keys.length}` } as any;
      });

    await addMember('Ravi Kumar', '98765 43210');
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    cleanup();
    await addMember('Anil Joseph', '98000 11122');
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    cleanup();
    await addMember('Ravi Kumar', '98765 43210');
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));

    expect(keys[0]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
  });
});

describe('Team list', () => {
  afterEach(cleanup);

  it('shows Retry, not an empty team, when the list fails', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.stations(), [ST_A]);
    vi.spyOn(CloudUserAssignmentService.prototype, 'listUsers').mockRejectedValue(
      Object.assign(new Error('boom'), { status: 500 }),
    );
    const restore = muteExpectedConsoleErrors([/boom/]);
    renderWithProviders(<UserRolesAssignment />, { queryClient });
    expect(await screen.findByText(/Couldn't load team members/)).toBeTruthy();
    expect(screen.queryByText('No team members yet')).toBeNull();
    restore();
    vi.restoreAllMocks();
  });
});
