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

const ST_A = { id: 'st-a', name: 'Kochi', code: 'KOC' };
const ST_B = { id: 'st-b', name: 'Thrissur', code: 'TCR' };

const renderTeam = (stations: any[], currentStationId: string | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.users(), []);
  queryClient.setQueryData(queryKeys.stations(), stations);
  renderWithProviders(<UserRolesAssignment currentStationId={currentStationId} />, {
    queryClient,
  });
  fireEvent.click(screen.getByRole('button', { name: /Add Team Member/ }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Member' }));
    expect(await screen.findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows an inline error when phone login has no phone (#300)', async () => {
    renderTeam([ST_A], null);
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), {
      target: { value: 'Ravi Kumar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Member' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Member' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      phone: '+919876543210',
      stationIds: ['st-a'],
    });
  });
});
