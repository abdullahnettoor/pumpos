import React, { useState } from 'react';
import { Station, reachableStations, showStationDropdown } from '@pump/shared';
import { Tabs, tabPanelProps, type TabItem } from '../../pump-ds/tabs/index.js';
import { PageFrame } from '../page-frame/index.js';
import { UserRolesAssignment } from '../StationSetup/UserRolesAssignment.js';
import { OrgProfile } from './OrgProfile.js';
import { ActivityFeed } from './ActivityFeed.js';
import { StationsTab } from './StationsTab.js';
import { DesktopAppPanel } from '../Desktop/DesktopAppPanel.js';
import { isDesktopApp } from '../../utils/platform.js';
import { clearNavIntent, useNavIntent } from '../../nav-intent/store.js';
import { ROUTES } from '../../nav-intent/routes.js';

type OrgTab = 'stations' | 'team' | 'activity' | 'profile' | 'desktop';

const TABS_ID = 'organization';

export interface OrganizationOverviewProps {
  stations: Station[];
  selectedStation: Station | null;
  onStationChange: (station: Station) => void;
  onNavigate: (path: string) => void;
}

/**
 * Owner-only organization workspace (#538): Page Frame with tabs Stations ·
 * Team · Activity · Profile · Desktop app. Each tab loads in its own Data
 * Sections. Per-station configuration still lives in Station for whichever
 * station is active.
 */
export const OrganizationOverview: React.FC<OrganizationOverviewProps> = ({
  stations,
  selectedStation,
  onStationChange,
  onNavigate,
}) => {
  const [chosenTab, setChosenTab] = useState<OrgTab>('stations');
  const showDesktopTab = !isDesktopApp();

  // Deep link from the dashboard's Desktop app step ("See options"): derived
  // from the pending intent until the user picks a tab themselves.
  const intent = useNavIntent();
  const tab: OrgTab =
    intent?.openOrganizationTab === 'desktop' && showDesktopTab ? 'desktop' : chosenTab;
  const setTab = (next: OrgTab) => {
    if (intent?.openOrganizationTab) clearNavIntent();
    setChosenTab(next);
  };

  // Same rule as the top-bar breadcrumb: a switch is offered only when more than
  // one station can be reached (this workspace is Owner-only: every station).
  const canSwitchStation = showStationDropdown(
    reachableStations({ role: 'Owner', assignedStationIds: [] }, stations),
  );

  return (
    <PageFrame
      route={ROUTES.organization}
      subtitle="Manage your stations and team across the organization."
      tabs={
        <Tabs
          id={TABS_ID}
          aria-label="Organization"
          activeId={tab}
          onChange={(id) => setTab(id as OrgTab)}
          tabs={[
            { id: 'stations', label: 'Stations', concept: 'stations', badge: stations.length },
            { id: 'team', label: 'Team', concept: 'team' },
            { id: 'activity', label: 'Activity', concept: 'activity' },
            { id: 'profile', label: 'Profile', concept: 'profile' },
            ...(showDesktopTab
              ? [{ id: 'desktop', label: 'Desktop app', concept: 'desktop-app' } satisfies TabItem]
              : []),
          ]}
        />
      }
    >
      <div {...tabPanelProps(TABS_ID, tab)}>
        {tab === 'stations' && (
          <StationsTab
            stations={stations}
            selectedStation={selectedStation}
            canSwitchStation={canSwitchStation}
            onStationChange={onStationChange}
            onOnboard={() => onNavigate('/onboarding')}
            onConfigure={() => onNavigate(ROUTES.station)}
            onInviteTeam={() => setTab('team')}
          />
        )}
        {tab === 'team' && <UserRolesAssignment currentStationId={selectedStation?.id ?? null} />}
        {tab === 'activity' && <ActivityFeed stations={stations} />}
        {tab === 'profile' && <OrgProfile />}
        {tab === 'desktop' && showDesktopTab && <DesktopAppPanel />}
      </div>
    </PageFrame>
  );
};
