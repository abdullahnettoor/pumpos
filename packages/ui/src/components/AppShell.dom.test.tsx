// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './primitives/ToastProvider.js';
import { AppShell, type NavItem } from './AppShell.js';

afterEach(cleanup);

const mockNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Shifts', path: '/shifts' },
  { label: 'Station Overview', path: '/setup/station' },
  { label: 'Expenses', path: '/expenses' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Customers', path: '/customers' },
  { label: 'Custom Nav', path: '/custom', icon: 'zap' },
];

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
};

describe('AppShell navigation and icons', () => {
  it('renders navigation links with Icon primitives and correct stroke/dimensions', () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        currentPath="/dashboard"
        onNavigate={onNavigate}
        userRole="Owner"
        userName="Admin User"
        syncStatus="synced"
        onLogout={() => {}}
      >
        <div>Content Body</div>
      </AppShell>,
    );

    // Verify main content rendered
    expect(screen.getByText('Content Body')).not.toBeNull();

    // Verify nav links have rendered icons with standard pump-ds size-[18px]
    const navButtons = screen.getAllByRole('button');
    const dashboardBtn = navButtons.find((btn) => btn.textContent?.includes('Dashboard'));
    expect(dashboardBtn).toBeDefined();

    const svg = dashboardBtn?.querySelector('svg');
    expect(svg).not.toBeNull();
    // Verify standard Icon attributes
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.classList.contains('size-[18px]')).toBe(true);
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');

    // Verify custom icon override
    const customBtn = navButtons.find((btn) => btn.textContent?.includes('Custom Nav'));
    expect(customBtn).toBeDefined();
    const customSvg = customBtn?.querySelector('svg');
    expect(customSvg).not.toBeNull();
    expect(customSvg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('handles navigation click and collapse toggle', () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        currentPath="/dashboard"
        onNavigate={onNavigate}
        userRole="Owner"
        userName="Admin User"
        syncStatus="synced"
        onLogout={() => {}}
      >
        <div>Content Body</div>
      </AppShell>,
    );

    const shiftsBtn = screen.getByText('Shifts').closest('button');
    expect(shiftsBtn).not.toBeNull();
    fireEvent.click(shiftsBtn!);
    expect(onNavigate).toHaveBeenCalledWith('/shifts');

    // Toggle sidebar via hamburger button
    const toggleBtn = screen.getByRole('button', { name: /toggle sidebar/i });
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn);

    // When collapsed, title attribute holds the label and text span is not rendered
    expect(screen.queryByText('Shifts')).toBeNull();
    const collapsedBtn = screen.getByTitle('Shifts');
    expect(collapsedBtn).not.toBeNull();
  });

  it('renders top bar header action icons with Icon primitives', () => {
    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        currentPath="/dashboard"
        onNavigate={() => {}}
        userRole="Owner"
        userName="Admin User"
        syncStatus="synced"
        onLogout={() => {}}
        stationReady={true}
      >
        <div>Content Body</div>
      </AppShell>,
    );

    // Sidebar hamburger toggle icon
    const toggleBtn = screen.getByRole('button', { name: /toggle sidebar/i });
    const toggleSvg = toggleBtn.querySelector('svg');
    expect(toggleSvg?.getAttribute('aria-hidden')).toBe('true');
    expect(toggleSvg?.classList.contains('size-[18px]')).toBe(true);

    // Notifications button icon
    const notifBtn = screen.getByRole('button', { name: /notifications/i });
    const notifSvg = notifBtn.querySelector('svg');
    expect(notifSvg?.getAttribute('aria-hidden')).toBe('true');
    expect(notifSvg?.classList.contains('size-[18px]')).toBe(true);
  });
});
