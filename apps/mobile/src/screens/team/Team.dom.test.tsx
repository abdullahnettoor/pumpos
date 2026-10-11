// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AccessMode, Role } from '@pump/shared';

/**
 * Managing the team from the Account sheet's Team page. Real TanStack Query and
 * real hooks; only the cloud services' network methods are stubbed.
 */
const ui = await import('@pump/ui');
const { TeamPage } = await import('./TeamPage.js');
const { ShellContext } = await import('../../shell/context.js');
const { NavProvider, useNav } = await import('../../shell/nav.js');
const { stackOf } = await import('../../shell/navStack.js');

const STATIONS = [
  { id: 's1', name: 'Highway Fuels', settings: {} },
  { id: 's2', name: 'City Fuels', settings: {} },
];
const user = (over: Record<string, unknown>) => ({
  id: 'u',
  fullName: 'Someone',
  email: null,
  phone: null,
  role: 'Staff',
  status: 'ACTIVE',
  hasLogin: true,
  stationIds: ['s1'],
  ...over,
});
const BASE_USERS = () => [
  user({ id: 'me', fullName: 'Asha Owner', role: 'Owner', stationIds: [], phone: '+919800000001' }),
  user({ id: 'mgr', fullName: 'Mani Manager', role: 'Manager', stationIds: ['s1'] }),
  user({ id: 'acc', fullName: 'Ann Accountant', role: 'Accountant', stationIds: ['s1'] }),
  user({
    id: 'st1',
    fullName: 'Sajid Staff',
    role: 'Staff',
    stationIds: ['s1'],
    phone: '+919876543210',
  }),
  user({ id: 'st2', fullName: 'Other Staff', role: 'Staff', stationIds: ['s2'] }),
  user({
    id: 'att',
    fullName: 'Ramesh Attendant',
    role: 'Attendant',
    stationIds: ['s1'],
    hasLogin: false,
  }),
  user({ id: 'old', fullName: 'Old Hand', role: 'Staff', stationIds: ['s1'], status: 'INACTIVE' }),
];

let users: any[];
let visibleStations: any[];
let accessMode: AccessMode | undefined;
let onShiftUserIds: string[];
const proto = ui.CloudUserAssignmentService.prototype;
const create = vi.spyOn(proto, 'createUser');
const update = vi.spyOn(proto, 'updateUser');
const reset = vi.spyOn(proto, 'resetUserPassword');
const deactivate = vi.spyOn(proto, 'deactivateUser');
const reactivate = vi.spyOn(proto, 'reactivateUser');
const listUsers = vi.spyOn(proto, 'listUsers');

const refusal = (code: string | undefined, message: string, status: number | undefined = 403) =>
  Object.assign(new Error(message), { code, status });

const Stage: React.FC = () => {
  const n = useNav();
  const stack = stackOf({ active: n.active, stacks: n.stacks, visited: [...n.visited] }, 'home');
  const top = stack[stack.length - 1];
  return top ? <>{top.element}</> : <TeamPage />;
};

const mount = (role: Role = 'Owner', userId = 'me') => {
  const qc = ui.createQueryClient();
  const view = render(
    <QueryClientProvider client={qc}>
      <ui.ToastProvider>
        <ShellContext.Provider
          value={{
            station: visibleStations[0],
            stationName: 'Highway Fuels',
            userName: 'Asha',
            userId,
            role,
            openAccount: () => {},
          }}
        >
          <NavProvider tabs={['home']}>
            <Stage />
          </NavProvider>
        </ShellContext.Provider>
      </ui.ToastProvider>
    </QueryClientProvider>,
  );
  return { qc, ...view };
};

const addButton = () => screen.queryByRole('button', { name: 'Add member' });
const openMember = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await screen.findByText('Details');
};

beforeEach(() => {
  users = BASE_USERS();
  visibleStations = [...STATIONS];
  accessMode = 'NORMAL';
  onShiftUserIds = ['st1'];
  listUsers.mockImplementation(async () => users as any);
  vi.spyOn(ui.CloudStationService.prototype, 'getStations').mockImplementation(
    async () => visibleStations as any,
  );
  vi.spyOn(ui.CloudShiftService.prototype, 'getShiftStatus').mockImplementation(
    async () =>
      ({
        activeShift: { staffAssignments: onShiftUserIds.map((userId) => ({ userId, duId: 'd' })) },
      }) as any,
  );
  vi.spyOn(ui.CloudAccessService.prototype, 'getAccess').mockImplementation(
    async () => ({ subscription: { mode: accessMode } }) as any,
  );
  for (const m of [create, update, reset, deactivate, reactivate]) m.mockReset();
  // The fake server keeps what it was given, so the refetch after a save agrees with it.
  create.mockImplementation(async (body: any) => {
    const row = { id: 'new-1', fullName: body.fullName, role: body.role, status: 'ACTIVE' };
    users = [
      ...users,
      {
        ...row,
        phone: body.phone,
        email: body.email,
        stationIds: body.stationIds,
        hasLogin: !!body.enableAppAccess,
      },
    ];
    return row as any;
  });
  update.mockImplementation(async (id: string, body: any) => {
    users = users.map((u) => (u.id === id ? { ...u, ...body } : u));
    return { id, ...body } as any;
  });
  reset.mockResolvedValue({} as any);
  const setStatus = (status: string) => async (id: string) => {
    users = users.map((u) => (u.id === id ? { ...u, status } : u));
    return { id, status } as any;
  };
  deactivate.mockImplementation(setStatus('INACTIVE'));
  reactivate.mockImplementation(setStatus('ACTIVE'));
});
afterEach(() => {
  cleanup();
});

describe('the Team page', () => {
  it('lists members with Role, stations and status, on-shift flagged', async () => {
    mount();
    const row = await screen.findByRole('button', { name: /Sajid Staff/ });
    expect(row.textContent).toMatch(/Staff · Highway Fuels/);
    await waitFor(() => expect(row.textContent).toMatch(/On shift/));
    expect(screen.getByRole('button', { name: /Asha Owner \(you\)/ }).textContent).toMatch(
      /Owner · All stations/,
    );
    expect(screen.getByRole('button', { name: /Ramesh Attendant/ }).textContent).toMatch(
      /No login/,
    );
    // Deactivated members sit under their own label.
    expect(screen.getByRole('button', { name: /Old Hand/ }).textContent).toMatch(/Inactive/);
    expect(screen.getByText('Inactive', { selector: 'h2' })).toBeTruthy();
  });

  it.each(['Owner', 'Manager'] as const)('%s sees Add member', async (role) => {
    mount(role, 'someone');
    await screen.findByRole('button', { name: /Sajid Staff/ });
    expect(addButton()).toBeTruthy();
  });

  it.each(['Accountant', 'Staff'] as const)('%s can look but not add', async (role) => {
    mount(role, 'someone');
    await screen.findByRole('button', { name: /Sajid Staff/ });
    expect(addButton()).toBeNull();
  });
});

describe('who a Manager may offer and manage', () => {
  beforeEach(() => {
    // A Manager's station list is already limited to their own.
    visibleStations = [STATIONS[0]];
  });

  it('offers only Staff and Attendant, and only their own station', async () => {
    mount('Manager', 'mgr');
    await screen.findByRole('button', { name: /Sajid Staff/ });
    fireEvent.click(addButton()!);
    const dialog = await screen.findByRole('dialog', { name: 'Add member' });
    const roles = within(dialog)
      .getAllByRole('radio')
      .map((r) => r.textContent)
      .filter((t) => ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'].includes(t ?? ''));
    expect(roles).toEqual(['Staff', 'Attendant']);
    expect(within(dialog).queryByRole('radio', { name: 'Owner' })).toBeNull();
    expect(within(dialog).queryByRole('radio', { name: 'Manager' })).toBeNull();
    expect(within(dialog).queryByRole('radio', { name: 'Accountant' })).toBeNull();
    const checks = within(dialog).getAllByRole('checkbox');
    expect(checks.map((c) => (c.closest('label') as HTMLElement).textContent)).toEqual([
      'Highway Fuels',
    ]);
  });

  it("shows an Accountant, a Manager and another station's member as read-only", async () => {
    mount('Manager', 'mgr');
    for (const name of ['Ann Accountant', 'Mani Manager', 'Asha Owner', 'Other Staff']) {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
      await screen.findByText(
        /Managers can manage only Staff and Attendants on their own stations\./,
      );
      expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Deactivate member/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(screen.queryByText('Details')).toBeNull());
    }
  });

  it('lets a Manager edit a Staff member on their station', async () => {
    mount('Manager', 'mgr');
    await openMember('Sajid Staff');
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deactivate member' })).toBeTruthy();
  });
});

describe('an Owner', () => {
  it('may give any Role', async () => {
    mount();
    await screen.findByRole('button', { name: /Sajid Staff/ });
    fireEvent.click(addButton()!);
    const dialog = await screen.findByRole('dialog', { name: 'Add member' });
    for (const r of ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'])
      expect(within(dialog).getByRole('radio', { name: r })).toBeTruthy();
    expect(within(dialog).getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2);
  });

  it('cannot deactivate or reset themselves, nor change their own Role', async () => {
    mount();
    await openMember('Asha Owner');
    expect(screen.queryByRole('button', { name: 'Deactivate member' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset password' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit member' });
    expect(within(dialog).getByRole('radio', { name: 'Owner' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(within(dialog).queryByRole('radio', { name: 'Staff' })).toBeNull();
    expect(within(dialog).getByText('You cannot change your own role.')).toBeTruthy();
  });
});

describe('Restricted Access and Suspension', () => {
  it.each([
    ['RESTRICTED', /restricted/i],
    ['SUSPENDED', /suspended/i],
  ] as const)('pauses Add member with the reason while %s', async (mode, text) => {
    accessMode = mode;
    mount();
    await screen.findByRole('button', { name: /Sajid Staff/ });
    await waitFor(() => expect(addButton()?.getAttribute('aria-disabled')).toBe('true'));
    const reason = screen.getByText(text);
    expect(addButton()!.getAttribute('aria-describedby')).toBe(reason.id);
    fireEvent.click(addButton()!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pauses the member actions too', async () => {
    accessMode = 'RESTRICTED';
    mount();
    await openMember('Sajid Staff');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit details' }).getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate member' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

const openAdd = async () => {
  await screen.findByRole('button', { name: /Sajid Staff/ });
  fireEvent.click(addButton()!);
  return screen.findByRole('dialog', { name: 'Add member' });
};
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submitButton = () =>
  within(screen.getByRole('dialog', { name: 'Add member' }))
    .getAllByRole('button', { name: 'Add member' })
    .find((b) => (b as HTMLButtonElement).type === 'submit')!;

describe('adding a member', () => {
  it('validates inline with the shared rules and sends nothing', async () => {
    mount();
    await openAdd();
    fireEvent.click(submitButton());
    expect(await screen.findByText(/Full name must be at least 2/)).toBeTruthy();
    expect(screen.getByText(/Enter a phone number/)).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    fill('Full name', 'Sajid');
    fill('Phone', '12345');
    fireEvent.click(submitButton());
    expect(await screen.findByText(/valid.*mobile/i)).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('adds a member with a login, sends a key, shows the credentials, and refreshes the users key', async () => {
    const { qc } = mount();
    await openAdd();
    fill('Full name', 'New Attendant');
    fireEvent.click(screen.getByRole('radio', { name: 'Attendant' }));
    fill('Phone', '98765 43211');
    // The current station is pre-checked.
    expect((screen.getByLabelText('Highway Fuels') as HTMLInputElement).checked).toBe(true);
    const password = (screen.getByLabelText('Password') as HTMLInputElement).value;
    expect(password.length).toBeGreaterThanOrEqual(8);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    fireEvent.click(submitButton());
    expect(await screen.findByText('Member added')).toBeTruthy();

    expect(create).toHaveBeenCalledTimes(1);
    const [body, opts] = create.mock.calls[0] as any;
    expect(body).toMatchObject({
      fullName: 'New Attendant',
      role: 'Attendant',
      phone: '+919876543211',
      email: null,
      stationIds: ['s1'],
      enableAppAccess: true,
      password,
    });
    expect(opts.idempotencyKey).toBeTruthy();
    // The credentials are handed over once, with the password.
    expect(screen.getByText(password)).toBeTruthy();
    expect(screen.getByText('+919876543211')).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ui.queryKeys.users() });
    // The new member is on the list at once.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: /New Attendant/ })).toBeTruthy();
  });

  it('adds a record-only member without app access', async () => {
    mount();
    await openAdd();
    fill('Full name', 'Walk In');
    fireEvent.click(screen.getByRole('switch', { name: 'Mobile app access' }));
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.click(submitButton());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [body] = create.mock.calls[0] as any;
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('enableAppAccess');
    expect(await screen.findByText('Member added.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("shows the organization's refusal inline and keeps the sheet", async () => {
    create.mockRejectedValue(refusal('SUBSCRIPTION_RESTRICTED', 'Team administration is blocked.'));
    mount();
    await openAdd();
    fill('Full name', 'Blocked Person');
    fill('Phone', '9876543212');
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Team administration is blocked.');
    expect(screen.getByRole('dialog', { name: 'Add member' })).toBeTruthy();
  });

  it('explains a reached Limit from the server', async () => {
    create.mockRejectedValue(
      refusal(
        'LIMIT_REACHED',
        'This plan includes 10 team members. Contact PumpOS to add more.',
        409,
      ),
    );
    mount();
    await openAdd();
    fill('Full name', 'One Too Many');
    fill('Phone', '9876543213');
    fireEvent.click(submitButton());
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This plan includes 10 team members. Contact PumpOS to add more.',
    );
  });

  it('a retried submit reuses one Idempotency-Key until the outcome is decided', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'NETWORK' }));
    mount();
    await openAdd();
    fill('Full name', 'Retry Person');
    fill('Phone', '9876543214');
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/will not be applied twice/);

    // The sheet is closed and reopened: the key survives.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(addButton()!);
    await screen.findByRole('dialog', { name: 'Add member' });
    fill('Full name', 'Retry Person');
    fill('Phone', '9876543214');
    fireEvent.click(submitButton());
    await screen.findByText('Member added');
    expect(create).toHaveBeenCalledTimes(2);
    expect((create.mock.calls[0] as any)[1].idempotencyKey).toBe(
      (create.mock.calls[1] as any)[1].idempotencyKey,
    );
  });

  it('takes a fresh key after a decided refusal', async () => {
    create.mockRejectedValueOnce(refusal('AUTH_PROVISION_FAILED', 'Already registered', 409));
    mount();
    await openAdd();
    fill('Full name', 'Dup Person');
    fill('Phone', '9876543215');
    fireEvent.click(submitButton());
    await screen.findByRole('alert');
    fireEvent.click(submitButton());
    await screen.findByText('Member added');
    expect((create.mock.calls[0] as any)[1].idempotencyKey).not.toBe(
      (create.mock.calls[1] as any)[1].idempotencyKey,
    );
  });

  it('refreshes the list and takes a new key when the key already holds an earlier attempt', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'NETWORK' }));
    create.mockRejectedValueOnce(
      refusal(
        'CONFLICT',
        'This Idempotency-Key was already used with different request content',
        409,
      ),
    );
    mount();
    await openAdd();
    fill('Full name', 'Edited Person');
    fill('Phone', '9876543217');
    fireEvent.click(submitButton());
    await screen.findByRole('alert');
    // They change a detail and retry: the server says the first attempt did arrive.
    fill('Full name', 'Edited Person Two');
    const listCalls = listUsers.mock.calls.length;
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/earlier attempt/i));
    await waitFor(() => expect(listUsers.mock.calls.length).toBeGreaterThan(listCalls));
    // Next try is a new logical save.
    fireEvent.click(submitButton());
    await screen.findByText('Member added');
    const keys = create.mock.calls.map((c) => (c as any)[1].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('a double tap sends one request', async () => {
    let release!: (v: any) => void;
    create.mockImplementation(() => new Promise((r) => (release = r)));
    mount();
    await openAdd();
    fill('Full name', 'Fast Fingers');
    fill('Phone', '9876543216');
    const button = submitButton();
    fireEvent.click(button);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);
    expect(create).toHaveBeenCalledTimes(1);
    release({ id: 'n', fullName: 'Fast Fingers', role: 'Staff' });
    await screen.findByText('Member added');
  });
});

describe('the member page', () => {
  it('titles the header "Team member" and shows the name and Role once, in the identity block', async () => {
    mount();
    await openMember('Sajid Staff');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Team member');
    expect(screen.getAllByText('Sajid Staff')).toHaveLength(1);
    expect(screen.getByText(/^Staff · Highway Fuels$/)).toBeTruthy();
  });

  it('edits details and Role, and repaints the list', async () => {
    mount();
    await openMember('Sajid Staff');
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit member' });
    expect((within(dialog).getByLabelText('Full name') as HTMLInputElement).value).toBe(
      'Sajid Staff',
    );
    fill('Full name', 'Sajid P');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Accountant' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [id, body, opts] = update.mock.calls[0] as any;
    expect(id).toBe('st1');
    expect(body).toMatchObject({ fullName: 'Sajid P', role: 'Accountant', stationIds: ['s1'] });
    expect(body).not.toHaveProperty('password');
    expect(opts.idempotencyKey).toBeTruthy();
    expect(await screen.findByText('Changes saved.')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Sajid P').length).toBeGreaterThan(0));
  });

  it('resets a password and shows it once', async () => {
    mount();
    await openMember('Sajid Staff');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reset password' });
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    expect(await within(dialog).findByText(/at least 8/)).toBeTruthy();
    expect(reset).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('New password'), {
      target: { value: 'Brand-new-pass1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    expect(reset.mock.calls[0][0]).toBe('st1');
    expect(reset.mock.calls[0][1]).toBe('Brand-new-pass1');
    expect((reset.mock.calls[0] as any)[2].idempotencyKey).toBeTruthy();
    expect(await screen.findByText('Brand-new-pass1')).toBeTruthy();
  });

  it('does not offer a reset for a member without a login', async () => {
    mount();
    await openMember('Ramesh Attendant');
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset password' })).toBeNull();
  });

  it('asks before deactivating, then marks them inactive and invalidates users', async () => {
    const { qc } = mount();
    await openMember('Sajid Staff');
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate member' });
    expect(deactivate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(deactivate).toHaveBeenCalledTimes(1));
    expect(deactivate.mock.calls[0][0]).toBe('st1');
    expect((deactivate.mock.calls[0] as any)[1].idempotencyKey).toBeTruthy();
    expect(await screen.findByText('Member deactivated.')).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ui.queryKeys.users() });
    expect(await screen.findByRole('button', { name: 'Reactivate member' })).toBeTruthy();
  });

  it('reactivates an inactive member', async () => {
    mount();
    await openMember('Old Hand');
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reactivate member' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(reactivate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Member reactivated.')).toBeTruthy();
  });

  it('shows a refusal on the sheet when deactivating is not allowed', async () => {
    deactivate.mockRejectedValue(refusal('FORBIDDEN', 'Not allowed to change this user'));
    mount();
    await openMember('Sajid Staff');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate member' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Not allowed to change this user',
    );
  });
});
