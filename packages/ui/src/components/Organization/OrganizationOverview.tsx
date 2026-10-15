import React, { useState } from 'react';
import { Station, reachableStations, showStationDropdown, stationLimitMessage } from '@pump/shared';
import { Tabs, tabPanelProps, type TabItem } from '../../pump-ds/tabs/index.js';
import { Button, Icon } from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { PageFrame } from '../page-frame/index.js';
import { UserRolesAssignment } from '../StationSetup/UserRolesAssignment.js';
import { MemberDrawer } from '../StationSetup/TeamMemberDrawers.js';
import { useAccess } from '../../query/hooks.js';
import { activityTimeZone, onboardGate } from './organizationModel.js';
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
 * Team · Activity · Profile · Desktop app, and the same page actions on every
 * tab (Add team member, Onboard station). Each tab loads in its own Data
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

  // Onboarding is refused at the station Limit (Access Document); the API
  // enforces it regardless of what is rendered here.
  const { data: access } = useAccess();
  const gate = onboardGate(access);
  const onboard = () => onNavigate('/onboarding');

  // A new member's drawer mounts fresh per open (keyed): its form and its
  // submit key start new.
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberKey, setMemberKey] = useState(0);
  const addMember = () => {
    setMemberKey((k) => k + 1);
    setMemberOpen(true);
  };

  // The same page actions on every tab (#515).
  const actions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<ConceptIcon concept="stations" />}
        disabled={gate.disabled}
        title={gate.title}
        onClick={onboard}
      >
        Onboard station
      </Button>
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Icon name="plus" size="sm" />}
        onClick={addMember}
      >
        Add team member
      </Button>
    </>
  );

  return (
    <>
      <PageFrame
        route={ROUTES.organization}
        subtitle="Manage your stations and team across the organization."
        actions={actions}
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
                ? [
                    {
                      id: 'desktop',
                      label: 'Desktop app',
                      concept: 'desktop-app',
                    } satisfies TabItem,
                  ]
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
              onOnboard={onboard}
              onboardGate={gate}
              onConfigure={() => onNavigate(ROUTES.station)}
              onInviteTeam={() => setTab('team')}
            />
          )}
          {tab === 'team' && <UserRolesAssignment currentStationId={selectedStation?.id ?? null} />}
          {tab === 'activity' && (
            <ActivityFeed stations={stations} timeZone={activityTimeZone(selectedStation)} />
          )}
          {tab === 'profile' && <OrgProfile />}
          {tab === 'desktop' && showDesktopTab && <DesktopAppPanel />}
        </div>
      </PageFrame>
      <MemberDrawer
        key={memberKey}
        isOpen={memberOpen}
        editingUser={null}
        currentStationId={selectedStation?.id ?? null}
        onClose={() => setMemberOpen(false)}
      />
    </>
  );
};
