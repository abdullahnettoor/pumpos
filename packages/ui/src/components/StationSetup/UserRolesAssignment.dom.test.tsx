// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  createTestQueryClient,
  muteExpectedConsoleErrors,
  renderWithProviders,
} from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { publishEffective, resetEffectivePrincipal } from '../../access/effectivePrincipal.js';
import { CloudUserAssignmentService } from '../../services/cloud.js';
import { UserRolesAssignment, defaultNewMemberStationIds } from './UserRolesAssignment.js';
import { MemberDrawer } from './TeamMemberDrawers.js';
import type { User } from '@pump/shared';

/** The member the API returns after a save, typed as the service returns it. */
const savedUser = (id: string): User => ({
  id,
  organizationId: 'org-1',
  fullName: 'Saved member',
  email: '',
  status: 'ACTIVE',
  createdAt: '2026-10-15T00:00:00Z',
  updatedAt: '2026-10-15T00:00:00Z',
});

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
      .mockResolvedValue(savedUser('u-new'));
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
        return savedUser(`u-${keys.length}`);
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

describe('Enable app access for a member without a login (#462)', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = muteExpectedConsoleErrors([/not wrapped in act/]);
    publishEffective('Owner', ['team.manage']);
  });
  afterEach(() => {
    cleanup();
    restore();
    resetEffectivePrincipal();
    vi.restoreAllMocks();
  });

  const noLogin = {
    id: 'u-nologin',
    fullName: 'Meera Nair',
    email: '',
    phone: '+919876543210',
    status: 'ACTIVE' as const,
    role: 'Staff' as const,
    hasLogin: false,
    stationIds: ['st-a'],
  };
  const granted = { ...noLogin, hasLogin: true };

  const renderEdit = (member: Record<string, unknown> = noLogin) => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.users(), [member]);
    queryClient.setQueryData(queryKeys.stations(), [ST_A, ST_B]);
    const view = renderWithProviders(
      <MemberDrawer isOpen editingUser={member as any} onClose={() => {}} />,
      { queryClient },
    );
    return { ...view, queryClient };
  };
  const section = () => screen.getByRole('region', { name: 'Enable app access' });
  const submit = () =>
    fireEvent.click(within(section()).getByRole('button', { name: 'Enable app access' }));
  const typePassword = (value: string) =>
    fireEvent.change(within(section()).getByPlaceholderText('At least 8 characters'), {
      target: { value },
    });

  it('is offered for a member without a login, and not for one who has a login', () => {
    renderEdit();
    expect(section()).toBeTruthy();
    cleanup();
    renderEdit(granted);
    expect(screen.queryByRole('region', { name: 'Enable app access' })).toBeNull();
  });

  it('is hidden when the caller cannot act on the member', () => {
    publishEffective('Manager', ['team.manage']);
    renderEdit({ ...noLogin, role: 'Manager' });
    expect(screen.queryByRole('region', { name: 'Enable app access' })).toBeNull();
  });

  it('is hidden when the caller cannot manage the team', () => {
    publishEffective('Accountant', []);
    renderEdit();
    expect(screen.queryByRole('region', { name: 'Enable app access' })).toBeNull();
  });

  it('sends the phone only, with one Idempotency-Key, then shows the credentials once', async () => {
    const grant = vi
      .spyOn(CloudUserAssignmentService.prototype, 'grantAppAccess')
      .mockResolvedValue(granted as any);
    renderEdit();
    typePassword('Secret123');
    submit();
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    const [id, body, opts] = grant.mock.calls[0];
    expect(id).toBe('u-nologin');
    expect(body).toEqual({ phone: '+919876543210', password: 'Secret123' });
    expect(opts?.idempotencyKey).toBeTruthy();
    expect(await screen.findByText(/the password is shown only once/)).toBeTruthy();
    expect(screen.getByText('+919876543210')).toBeTruthy();
    expect(screen.getByText('Secret123')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Enable app access' })).toBeNull();
  });

  it('sends the email only when the member signs in with email', async () => {
    const grant = vi
      .spyOn(CloudUserAssignmentService.prototype, 'grantAppAccess')
      .mockResolvedValue(granted as any);
    renderEdit();
    fireEvent.click(within(section()).getByRole('radio', { name: 'Email' }));
    fireEvent.change(within(section()).getByPlaceholderText('e.g. john@station.com'), {
      target: { value: ' meera@station.com ' },
    });
    typePassword('Secret123');
    submit();
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    expect(grant.mock.calls[0][1]).toEqual({ email: 'meera@station.com', password: 'Secret123' });
  });

  it('starts on Email, prefilled, for a member who has an email on record', async () => {
    const grant = vi
      .spyOn(CloudUserAssignmentService.prototype, 'grantAppAccess')
      .mockResolvedValue({ ...granted, email: 'meera@station.com' } as any);
    renderEdit({ ...noLogin, email: 'meera@station.com', phone: '' });
    expect(
      within(section()).getByRole('radio', { name: 'Email' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      (within(section()).getByPlaceholderText('e.g. john@station.com') as HTMLInputElement).value,
    ).toBe('meera@station.com');
    typePassword('Secret123');
    submit();
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    expect(grant.mock.calls[0][1]).toEqual({ email: 'meera@station.com', password: 'Secret123' });
  });

  it('marks the member as having a login, and refreshes users and the access document', async () => {
    vi.spyOn(CloudUserAssignmentService.prototype, 'grantAppAccess').mockResolvedValue(
      granted as any,
    );
    const { queryClient } = renderEdit();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    typePassword('Secret123');
    submit();
    await screen.findByText(/the password is shown only once/);
    const cached = queryClient.getQueryData<{ id: string; hasLogin: boolean }[]>(queryKeys.users());
    expect(cached?.find((u) => u.id === 'u-nologin')?.hasLogin).toBe(true);
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.users()));
    expect(keys).toContain(JSON.stringify(queryKeys.access()));
  });

  it('does not send a short password or an invalid mobile', async () => {
    const grant = vi.spyOn(CloudUserAssignmentService.prototype, 'grantAppAccess');
    renderEdit();
    typePassword('short');
    submit();
    expect(await screen.findByText('Password must be at least 8 characters')).toBeTruthy();
    fireEvent.change(within(section()).getByPlaceholderText('e.g. 98765 43210'), {
      target: { value: '12345' },
    });
    typePassword('Secret123');
    submit();
    expect(await screen.findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
    expect(grant).not.toHaveBeenCalled();
  });

  it('shows a refusal inline with its message and keeps the form', async () => {
    vi.spyOn(CloudUserAssignmentService.prototype, 'grantAppAccess').mockRejectedValue(
      Object.assign(new Error('That phone number is already used by another login.'), {
        status: 409,
      }),
    );
    renderEdit();
    typePassword('Secret123');
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('That phone number is already used by another login.');
    expect(section()).toBeTruthy();
    expect(screen.queryByText(/the password is shown only once/)).toBeNull();
  });

  it('shows Reset password on the member once access is given', async () => {
    vi.spyOn(CloudUserAssignmentService.prototype, 'grantAppAccess').mockResolvedValue(
      granted as any,
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.users(), [noLogin]);
    queryClient.setQueryData(queryKeys.stations(), [ST_A, ST_B]);
    renderWithProviders(<UserRolesAssignment />, { queryClient });
    expect(screen.queryByLabelText('Reset password')).toBeNull();
    fireEvent.click(screen.getByLabelText('Edit member'));
    typePassword('Secret123');
    submit();
    await screen.findByText(/the password is shown only once/);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.getByLabelText('Reset password')).toBeTruthy());
  });
});
