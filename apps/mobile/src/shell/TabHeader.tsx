import React from 'react';
import { PageHeader } from '../ui/PageHeader.js';
import { useShell } from './context.js';

/** Header of a tab root (every tab except Home): the shell's station name + Account sheet wired into `PageHeader`. */
export const TabHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({
  title,
  right,
}) => {
  const { stationName, openAccount } = useShell();
  return (
    <PageHeader
      title={title}
      right={right}
      stationName={stationName}
      onStationPress={openAccount}
    />
  );
};
