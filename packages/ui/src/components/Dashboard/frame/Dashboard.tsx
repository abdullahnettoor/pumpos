import React from 'react';
import type { OperatorRole, Station } from '@pump/shared';
import { useStationClock } from '../../../hooks/useStationClock.js';
import type { NavIntent } from '../../AppShell.js';
import { TimelineCard } from '../cards/TimelineCard.js';
import { DashboardBoard } from './DashboardBoard.js';
import { DashboardProvider } from './DashboardContext.js';
import { DashboardHeader } from './DashboardHeader.js';
import { OpenDaysNotice } from './OpenDaysNotice.js';

/**
 * The operational dashboard frame (post-onboarding): header, open-days
 * notice, Getting Started, full-width timeline, responsive board. No
 * page-level loading/error: every card owns its own state.
 */
export const Dashboard: React.FC<{
  station: Station;
  role: OperatorRole;
  userName: string;
  onNavigate: (path: string, intent?: NavIntent) => void;
  /** Optional content between the open-days notice and the timeline (the Getting Started checklist). */
  aboveBoard?: React.ReactNode;
}> = ({ station, role, userName, onNavigate, aboveBoard }) => {
  const clock = useStationClock(station.settings);
  return (
    <DashboardProvider value={{ station, role, userName, onNavigate, ...clock }}>
      <div className="animate-fade-in flex flex-col gap-3">
        <DashboardHeader />
        <OpenDaysNotice />
        {aboveBoard}
        <TimelineCard />
        <DashboardBoard />
      </div>
    </DashboardProvider>
  );
};
