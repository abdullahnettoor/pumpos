import React from 'react';
import type { Station } from '@pump/shared';
import {
  useStationBusinessDate,
  useStationEntryDate,
} from '../../../hooks/useStationBusinessDate.js';
import type { NavIntent } from '../../AppShell.js';
import { DashboardBoard } from './DashboardBoard.js';
import { DashboardProvider, type DashboardRole } from './DashboardContext.js';
import { DashboardHeader } from './DashboardHeader.js';
import { OpenDaysNotice } from './OpenDaysNotice.js';

/**
 * The operational dashboard frame (post-onboarding): header, open-days
 * notice, responsive board. No page-level loading/error: every card owns its
 * own state.
 */
export const Dashboard: React.FC<{
  station: Station;
  role: DashboardRole;
  userName: string;
  onNavigate: (path: string, intent?: NavIntent) => void;
  /** Optional content between the header and the board (the Getting Started checklist). */
  aboveBoard?: React.ReactNode;
}> = ({ station, role, userName, onNavigate, aboveBoard }) => {
  const settings = (station.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const businessDate = useStationBusinessDate(settings.timezone, settings.business_day_starts_at);
  const entryDate = useStationEntryDate(settings.timezone);
  return (
    <DashboardProvider
      value={{
        station,
        role,
        userName,
        timeZone: settings.timezone,
        dayStartsAt: settings.business_day_starts_at,
        businessDate,
        entryDate,
        onNavigate,
      }}
    >
      <div className="animate-fade-in flex flex-col gap-3">
        <DashboardHeader />
        {aboveBoard}
        <OpenDaysNotice />
        <DashboardBoard />
      </div>
    </DashboardProvider>
  );
};
