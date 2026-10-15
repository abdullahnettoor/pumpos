import React from 'react';
import { AccountsPanel } from '../components/finance/AccountsPanel.js';
import { ROUTES } from '../nav-intent/routes.js';
import { useRoutePath } from '../nav-intent/useRoutePath.js';

/**
 * Test seam: Accounts as the shell mounts it, on the real hash route
 * (`useRoutePath`), so a test can open an account, go back and forward, and
 * reload. Set `window.location.hash` first to start on an account's page.
 */
export const AccountsRoute: React.FC<{ selectedStation: any }> = ({ selectedStation }) => {
  const [route, navigate] = useRoutePath(ROUTES.accounts);
  return <AccountsPanel selectedStation={selectedStation} route={route} onNavigate={navigate} />;
};
