import React from 'react';
import { canViewMobileInsights } from '@pump/shared';
import { PageHeader } from '../ui/PageHeader.js';
import { AlertsBell } from './AlertsBell.js';
import { useShell } from './context.js';

/**
 * Header of a tab root (every tab except Home): the shell's station name + Account sheet wired into `PageHeader`.
 * A Role that may see alerts (Owner, Manager: `canViewMobileInsights`) gets the
 * bell here too, since Home (the bell's other place) is the Owner's alone.
 */
export const TabHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({
  title,
  right,
}) => {
  const { stationName, openAccount, role } = useShell();
  const bell = canViewMobileInsights(role);
  return (
    <PageHeader
      title={title}
      right={
        bell ? (
          <div className="flex items-center gap-2">
            {right}
            <AlertsBell />
          </div>
        ) : (
          right
        )
      }
      stationName={stationName}
      onStationPress={openAccount}
    />
  );
};
