/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanup, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { defaultPermissionsFor, type AccessDocument, type Role } from '@pump/shared';
import { QueryProvider, queryKeys, resetEffectivePrincipal, useEffectivePrincipal } from '@pump/ui';
import { tabsForRole } from './tabs.js';

/** Mobile tabs follow the effective Permissions in the Access Document (ADR 0013). */
function withDocument(role: Role, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.access(), { permissions } as AccessDocument);
  renderHook(() => useEffectivePrincipal(role), {
    wrapper: ({ children }) => <QueryProvider client={client}>{children}</QueryProvider>,
  });
}

afterEach(() => {
  cleanup();
  resetEffectivePrincipal();
});

describe('tabsForRole with an Access Document', () => {
  it.each([
    ['reports.view', 'reports'],
    ['accounts.manage', 'money'],
    ['mobile.shifts', 'shifts'],
    ['mobile.insights', 'insights'],
    ['mobile.home', 'home'],
  ] as const)('%s opens the %s tab for a Role that lacks it', (permission, tab) => {
    withDocument('Staff', [permission]);
    expect(tabsForRole('Staff', false)).toEqual([tab]);
  });

  it('drops a tab whose Permission was revoked', () => {
    const perms = [...defaultPermissionsFor('Manager')].filter((p) => p !== 'mobile.insights');
    withDocument('Manager', perms);
    const tabs = tabsForRole('Manager', false);
    expect(tabs).not.toContain('insights');
    expect(tabs).toContain('reports');
  });

  it('keeps Role defaults without a document', () => {
    expect(tabsForRole('Accountant', false)).toEqual(['reports', 'money']);
  });

  it('leaves the Attendant app unchanged: no owner tabs', () => {
    withDocument('Attendant', [...defaultPermissionsFor('Attendant')]);
    expect(tabsForRole('Attendant', true)).toEqual([]);
  });
});
