// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Station } from '@pump/shared';

const hooks = vi.hoisted(() => ({
  useCustomers: vi.fn(),
  useSuppliers: vi.fn(),
  useUsers: vi.fn(),
  useDesktopDownloads: vi.fn(),
}));
vi.mock('../../query/hooks.js', () => hooks);
vi.mock('./frame/Dashboard.js', () => ({
  Dashboard: ({ aboveBoard }: { aboveBoard?: React.ReactNode }) => (
    <div>
      {aboveBoard}
      <div data-testid="board" />
    </div>
  ),
}));

import { DashboardOverview } from './DashboardOverview.js';

const READY = {
  id: 'st-1',
  organizationId: 'org-1',
  name: 'Highway',
  code: 'HW',
  onboardingStatus: 'READY_FOR_OPERATIONS',
} as unknown as Station;

const mount = (role: 'Owner' | 'Manager' | 'Accountant' | 'Staff') =>
  render(
    <DashboardOverview
      selectedStation={READY}
      userRole={role}
      userName="Sam"
      onNavigate={vi.fn()}
    />,
  );

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  hooks.useCustomers.mockReturnValue({ data: [] });
  hooks.useSuppliers.mockReturnValue({ data: [] });
  hooks.useUsers.mockReturnValue({ data: [{}] });
  hooks.useDesktopDownloads.mockReturnValue({ data: undefined });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DashboardOverview Getting Started (ready station)', () => {
  it('shows the dismissible checklist above the board while steps remain', () => {
    mount('Owner');
    const dismiss = screen.getByRole('button', { name: 'Dismiss getting started' });
    const board = screen.getByTestId('board');
    expect(dismiss.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('stays dismissed after Dismiss, across remounts', () => {
    const first = mount('Owner');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting started' }));
    expect(screen.queryByRole('button', { name: 'Dismiss getting started' })).toBeNull();
    first.unmount();
    mount('Owner');
    expect(screen.queryByRole('button', { name: 'Dismiss getting started' })).toBeNull();
  });

  it('is not shown to roles that cannot onboard', () => {
    mount('Staff');
    expect(screen.queryByRole('button', { name: 'Dismiss getting started' })).toBeNull();
    expect(screen.getByTestId('board')).toBeTruthy();
  });
});
