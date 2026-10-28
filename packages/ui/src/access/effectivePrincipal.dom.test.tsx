/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { can, defaultPermissionsFor, type AccessDocument, type Role } from '@pump/shared';
import { QueryProvider } from '../query/queryClient.js';
import { queryKeys } from '../query/hooks.js';
import { NAV_PAGES } from '../nav-intent/routes.js';
import { preReadyQuickCreateIds } from '../components/quickCreateActions.js';
import {
  principalFor,
  principalFromAccess,
  resetEffectivePrincipal,
  useEffectivePrincipal,
} from './effectivePrincipal.js';

const served = vi.hoisted(() => ({ doc: undefined as unknown }));
vi.mock('../services/cloud.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/cloud.js')>();
  class CloudAccessService extends mod.CloudAccessService {
    getAccess() {
      return Promise.resolve(served.doc) as any;
    }
  }
  return { ...mod, CloudAccessService };
});

const docWith = (permissions: string[] | undefined): AccessDocument => ({
  plan: 'CORE',
  capabilities: {},
  limits: {} as AccessDocument['limits'],
  subscription: {
    status: 'ACTIVE',
    mode: 'NORMAL',
    accessUntil: null,
    showWarning: false,
    warningMessage: null,
    resolution: null,
  },
  permissions,
});

/** What the sidebar shows: pages the effective set allows, plus one action. */
const Screen: React.FC<{ role: Role }> = ({ role }) => {
  useEffectivePrincipal(role);
  const principal = principalFor(role);
  return (
    <div>
      {NAV_PAGES.filter((p) => !p.permission || can(principal, p.permission)).map((p) => (
        <span key={p.path} data-testid="page">
          {p.label}
        </span>
      ))}
      {can(principal, 'expenses.create') && <button>New expense</button>}
      {preReadyQuickCreateIds(role).includes('onboard-station') && <i>onboard</i>}
    </div>
  );
};

const pages = () => screen.queryAllByTestId('page').map((e) => e.textContent);

function mount(role: Role, doc: AccessDocument | undefined, client = new QueryClient()) {
  served.doc = doc;
  client.setDefaultOptions({ queries: { retry: false } });
  if (doc) client.setQueryData(queryKeys.access(), doc);
  const view = render(
    <QueryProvider client={client}>
      <Screen role={role} />
    </QueryProvider>,
  );
  return { client, ...view };
}

beforeEach(() => resetEffectivePrincipal());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetEffectivePrincipal();
});

describe('principalFromAccess', () => {
  it('falls back to Role defaults while the document is absent', () => {
    expect(principalFromAccess('Manager', undefined).permissions).toBeUndefined();
    expect(can(principalFromAccess('Manager', undefined), 'pages.shifts')).toBe(true);
  });
  it('uses the effective set instead of Role defaults', () => {
    const p = principalFromAccess('Accountant', docWith(['pages.dashboard']));
    expect(can(p, 'pages.dashboard')).toBe(true);
    expect(can(p, 'pages.reports')).toBe(false);
  });
});

describe('pages and actions follow the effective Permissions', () => {
  it('shows exactly the pages whose View Permission is held', () => {
    mount('Accountant', docWith(['pages.dashboard', 'pages.customers']));
    expect(pages()).toEqual(
      NAV_PAGES.filter((p) =>
        ['pages.dashboard', 'pages.customers'].includes(p.permission as string),
      ).map((p) => p.label),
    );
  });

  it('adds a page the Role never had when the Owner granted it', () => {
    const base = [...defaultPermissionsFor('Staff')];
    expect(pages()).toEqual([]);
    mount('Staff', docWith([...base, 'pages.reports']));
    expect(pages()).toContain('Reports');
  });

  it('removes a page the Role had by default when it was revoked', () => {
    const without = [...defaultPermissionsFor('Manager')].filter((p) => p !== 'pages.shifts');
    mount('Manager', docWith(without));
    expect(pages()).not.toContain('Shifts');
    expect(pages()).toContain('Dashboard');
  });

  it('hides an action without its Permission and shows it with it', () => {
    const base = [...defaultPermissionsFor('Manager')].filter((p) => p !== 'expenses.create');
    const { unmount } = mount('Manager', docWith(base));
    expect(screen.queryByText('New expense')).toBeNull();
    unmount();
    mount('Manager', docWith([...base, 'expenses.create']));
    expect(screen.getByText('New expense')).toBeTruthy();
  });

  it('keeps the Role defaults before any document arrives', () => {
    mount('Manager', undefined);
    expect(pages()).toContain('Shifts');
  });

  it('Attendant gets its fixed set from the document unchanged', () => {
    const fixed = [...defaultPermissionsFor('Attendant')];
    mount('Attendant', docWith(fixed));
    expect(pages()).toEqual(
      NAV_PAGES.filter((p) => !p.permission || fixed.includes(p.permission)).map((p) => p.label),
    );
  });
});

describe('a Permission change reaches the screen without a reload', () => {
  it('refetches on window focus and re-renders the menus', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-16T10:00:00Z') });
    const before = [...defaultPermissionsFor('Staff')];
    const { client } = mount('Staff', docWith(before));
    expect(pages()).not.toContain('Reports');

    served.doc = docWith([...before, 'pages.reports']);
    vi.setSystemTime(new Date('2026-10-16T10:05:00Z'));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(pages()).toContain('Reports'));
    expect(client.getQueryData<AccessDocument>(queryKeys.access())?.permissions).toContain(
      'pages.reports',
    );
  });
});
