import React from 'react';
import { can } from '@pump/shared';
import { principalFor } from '@pump/ui';
import { PageHeader } from '../ui/PageHeader.js';
import { AlertsBell } from './AlertsBell.js';
import { useShell } from './context.js';
import { useNav } from './nav.js';
import { DensityPage } from '../screens/density/DensityPage.js';

/**
 * Header of a tab root (every tab except Home): the shell's station name + Account sheet wired into `PageHeader`.
 * A Role that may see alerts (Owner, Manager: `canViewMobileInsights`) gets the
 * bell here too, so it is one tap from every tab (Home's header has it as well).
 */
export const TabHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({
  title,
  right,
}) => {
  const { stationName, openAccount, role } = useShell();
  const nav = useNav();
  const bell =
    can(principalFor(role), 'mobile.insights') || can(principalFor(role), 'inventory.density');
  const densityAction = can(principalFor(role), 'mobile.densityShortcut') ? (
    <button
      type="button"
      onClick={() => nav.push(<DensityPage />, 'density')}
      className="text-xs font-semibold text-accent"
    >
      Density
    </button>
  ) : null;
  return (
    <PageHeader
      title={title}
      right={
        bell ? (
          <div className="flex items-center gap-2">
            {right ?? densityAction}
            <AlertsBell />
          </div>
        ) : (
          (right ?? densityAction)
        )
      }
      stationName={stationName}
      onStationPress={openAccount}
    />
  );
};
