// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { defaultPermissionsFor, PERMISSIONS, type UserPermissionsView } from '@pump/shared';
import { createTestQueryClient, renderWithProviders } from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { CloudUserAssignmentService } from '../../services/cloud.js';
import { PermissionsDrawer } from './PermissionsDrawer.js';
import { UserRolesAssignment } from './UserRolesAssignment.js';
import { MemberDrawer } from './TeamMemberDrawers.js';

/** This jsdom has no usable localStorage: give the screen an in-memory one. */
function resetStorage() {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  });
}

const ROLE = 'Staff';
const defaults = [...defaultPermissionsFor(ROLE)] as string[];
const user = { id: 'u1', fullName: 'Asha', role: ROLE };
const label = (id: string) => (PERMISSIONS as any)[id].label as string;

// A held Permission with a prerequisite (so revoking the prerequisite turns it off)...
const dependant = Object.entries(PERMISSIONS).find(
  ([id, d]) => defaults.includes(id) && d.prerequisites.length > 0,
)!;
const prereqId = dependant[1].prerequisites[0] as string;
// ... and one switch that is never delegable.
const neverId = Object.entries(PERMISSIONS).find(([, d]) => d.neverDelegable)![0];
// ... and a delegable Permission the role lacks (to grant).
const extraId = Object.entries(PERMISSIONS).find(
  ([id, d]) =>
    !defaults.includes(id) &&
    !d.neverDelegable &&
    d.prerequisites.every((p) => defaults.includes(p)),
)![0];

const view = (over: Partial<UserPermissionsView> = {}): UserPermissionsView => ({
  userId: 'u1',
  role: ROLE,
  editable: true,
  readOnlyReason: null,
  entitled: true,
  defaults,
  changes: { granted: [], revoked: [] },
  effective: defaults,
  ...over,
});

const renderDrawer = (v: UserPermissionsView, u: any = user) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.userPermissions('u1'), v);
  return renderWithProviders(<PermissionsDrawer isOpen user={u} onClose={() => {}} />, {
    queryClient,
  });
};
const area = (id: string) => (PERMISSIONS as any)[id].area as string;
const expand = (id: string) => {
  const btn = screen.getAllByRole('button', { name: new RegExp(`^${area(id)}`) })[0];
  if (btn.getAttribute('aria-expanded') !== 'true') fireEvent.click(btn);
};
const sw = (id: string) => screen.getByRole('switch', { name: label(id) }) as HTMLInputElement;

describe('Permissions drawer (#555)', () => {
  beforeEach(() => resetStorage());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('marks changed switches Custom and sends one keyed PUT on Save', async () => {
    const put = vi
      .spyOn(CloudUserAssignmentService.prototype, 'setUserPermissions')
      .mockResolvedValue(view());
    renderDrawer(view());
    expand(extraId);
    expect(screen.queryByText('Custom')).toBeNull();
    fireEvent.click(sw(extraId));
    expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][1].granted).toContain(extraId);
    expect(put.mock.calls[0][2]?.idempotencyKey).toBeTruthy();
  });

  it('shows "Also turns off" on a prerequisite and drops dependants when switched', () => {
    renderDrawer(view());
    expand(prereqId);
    expect(screen.getAllByText(/Also turns off/).length).toBeGreaterThan(0);
    fireEvent.click(sw(prereqId));
    expect(sw(prereqId).checked).toBe(false);
    expand(dependant[0]);
    expect(sw(dependant[0]).checked).toBe(false);
  });

  it('shows "Also turns on" for a Permission whose prerequisite is off', () => {
    const lacking = Object.entries(PERMISSIONS).find(
      ([id, d]) =>
        !defaults.includes(id) &&
        !d.neverDelegable &&
        d.prerequisites.some(
          (p) => !defaults.includes(p) && !(PERMISSIONS as any)[p].neverDelegable,
        ),
    );
    if (!lacking) return;
    renderDrawer(view());
    expand(lacking[0]);
    expect(screen.getAllByText(/Also turns on/).length).toBeGreaterThan(0);
  });

  it('Reset to role defaults clears every change', () => {
    renderDrawer(
      view({ changes: { granted: [extraId], revoked: [] }, effective: [...defaults, extraId] }),
    );
    expand(extraId);
    expect(sw(extraId).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to role defaults' }));
    expect(sw(extraId).checked).toBe(false);
    expect(screen.queryByText('Custom')).toBeNull();
  });

  it('locks never-delegable items', () => {
    renderDrawer(view());
    expand(neverId);
    expect(sw(neverId).disabled).toBe(true);
    expect(screen.getAllByText('Owner only').length).toBeGreaterThan(0);
  });

  it('is read-only with a reason for an Attendant', () => {
    renderDrawer(view({ role: 'Attendant', editable: false, readOnlyReason: 'ATTENDANT' }), {
      ...user,
      role: 'Attendant',
    });
    expect(screen.getByText(/fixed set for the mobile handover/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save permissions' })).toBeNull();
  });

  it('without the plan feature: read-only, upgrade note, changes kept not applied', () => {
    renderDrawer(
      view({ entitled: false, changes: { granted: [extraId], revoked: [] }, effective: defaults }),
    );
    expect(screen.getByText(/not on your plan/)).toBeTruthy();
    expect(screen.getByText(/kept, not applied/)).toBeTruthy();
    expand(extraId);
    expect(sw(extraId).disabled).toBe(true);
    expect(screen.getAllByText('Kept, not applied').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Save permissions' })).toBeNull();
  });
});

describe('Role change confirmation (#555)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists the dropped changes and does not save until confirmed', async () => {
    const preview = vi
      .spyOn(CloudUserAssignmentService.prototype, 'previewUserRoleChange')
      .mockResolvedValue({
        userId: 'u1',
        fromRole: 'Staff',
        toRole: 'Manager',
        droppedChanges: { granted: [extraId], revoked: [] },
      });
    const update = vi.spyOn(CloudUserAssignmentService.prototype, 'updateUser').mockResolvedValue({
      id: 'u1',
      droppedPermissionChanges: { granted: [extraId], revoked: [] },
    } as any);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.users(), []);
    queryClient.setQueryData(queryKeys.stations(), []);
    renderWithProviders(
      <MemberDrawer
        isOpen
        editingUser={{
          id: 'u1',
          fullName: 'Asha',
          role: 'Staff',
          hasLogin: true,
          status: 'ACTIVE',
          phone: '',
          email: 'a@b.co',
          stationIds: [],
        }}
        onClose={() => {}}
      />,
      { queryClient },
    );
    fireEvent.change(
      screen
        .getAllByRole('combobox')
        .find((e) => (e as HTMLSelectElement).querySelector('option[value="Manager"]'))!,
      { target: { value: 'Manager' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(preview).toHaveBeenCalledWith('u1', 'Manager'));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(dialog).getByText(new RegExp(label(extraId)))).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
  });
});

describe('Team list (#555)', () => {
  beforeEach(() => resetStorage());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderTeam = () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.stations(), []);
    queryClient.setQueryData(queryKeys.users(), [
      {
        id: 'u1',
        fullName: 'Asha',
        role: 'Staff',
        hasLogin: true,
        status: 'ACTIVE',
        hasCustomPermissions: true,
        stationIds: [],
      },
      {
        id: 'u2',
        fullName: 'Ben',
        role: 'Manager',
        hasLogin: true,
        status: 'ACTIVE',
        hasCustomPermissions: false,
        stationIds: [],
      },
    ]);
    return renderWithProviders(<UserRolesAssignment />, { queryClient });
  };

  it('badges only the member with custom permissions', () => {
    renderTeam();
    expect(screen.getAllByText('Custom')).toHaveLength(1);
  });

  it('shows the explainer once, persisting its dismissal', () => {
    renderTeam();
    expect(screen.getByText(/Permissions are now per member/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Permissions are now per member/)).toBeNull();
    cleanup();
    renderTeam();
    expect(screen.queryByText(/Permissions are now per member/)).toBeNull();
  });

  it('opens the role matrix', () => {
    renderTeam();
    fireEvent.click(screen.getAllByText('What each role can do')[0]);
    expect(screen.getByRole('table', { name: 'Role permission matrix' })).toBeTruthy();
  });
});
