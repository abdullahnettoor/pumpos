import React, { useState } from 'react';
import { Station } from '@pump/shared';
import { PageLayout } from '../primitives/PageLayout.js';
import { Tabs } from '../primitives/Tabs.js';
import { Chip, Button } from '../../pump-ds/index.js';
import { UserRolesAssignment } from '../StationSetup/UserRolesAssignment.js';
import { OrgProfile } from './OrgProfile.js';
import { ActivityFeed } from './ActivityFeed.js';
import { Check, Fuel, Users, Plus } from 'lucide-react';

export interface OrganizationOverviewProps {
  stations: Station[];
  selectedStation: Station | null;
  onStationChange: (station: Station) => void;
  onNavigate: (path: string) => void;
}

const statusBadge = (status?: string) => {
  switch (status) {
    case 'READY_FOR_OPERATIONS':
      return <Chip tone="success" size="sm">Ready</Chip>;
    case 'IN_PROGRESS':
      return <Chip tone="warning" size="sm">Setup in progress</Chip>;
    default:
      return <Chip tone="neutral" size="sm">Not started</Chip>;
  }
};

/**
 * Owner-only organization workspace: the org's stations (with the "set active
 * station" switch, relocated from the top bar) and the org-wide team
 * (moved out of Station Overview). Per-station configuration still lives in
 * Station Overview for whichever station is active.
 */
export const OrganizationOverview: React.FC<OrganizationOverviewProps> = ({
  stations,
  selectedStation,
  onStationChange,
  onNavigate,
}) => {
  const [tab, setTab] = useState<'stations' | 'team' | 'activity' | 'profile'>('stations');

  const hasReadyStation = stations.some((s) => (s as any).onboardingStatus === 'READY_FOR_OPERATIONS');

  return (
    <PageLayout
      title="Organization"
      subtitle="Manage your stations and team across the organization."
      toolbar={
        <Tabs
          variant="underline"
          aria-label="Organization"
          activeId={tab}
          onChange={(id) => setTab(id as 'stations' | 'team' | 'activity' | 'profile')}
          tabs={[
            { id: 'stations', label: 'Stations', badge: stations.length },
            { id: 'team', label: 'Team' },
            { id: 'activity', label: 'Activity' },
            { id: 'profile', label: 'Profile' },
          ]}
        />
      }
    >
      {tab === 'stations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Getting-started welcome — shown until the first station is operational. */}
          {!hasReadyStation && (
            <div
              className="card card-default"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px', backgroundColor: 'var(--bg-surface-alt)' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)' }}>
                  {stations.length === 0 ? 'Welcome to PumpOS' : 'Finish setting up your station'}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Get your station operational to unlock shifts, sales and reports. It takes a few minutes and
                  can be done here on desktop.
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Button variant="primary" size="sm" leftIcon={<Fuel size={14} />} onClick={() => onNavigate('/onboarding')}>
                  Onboard station
                </Button>
                <Button variant="secondary" size="sm" leftIcon={<Users size={14} />} onClick={() => setTab('team')}>
                  Invite your team
                </Button>
              </div>
            </div>
          )}

          {/* Stations list header with an always-available onboard action. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Stations
            </span>
            <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={() => onNavigate('/onboarding')}>
              Onboard station
            </Button>
          </div>

          {stations.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No stations yet.</div>
          ) : (
            stations.map((s) => {
              const active = s.id === selectedStation?.id;
              const details = [s.address, s.phone, (s as any).settings?.fuel_brand].filter(Boolean).join(' · ');
              return (
                <div
                  key={s.id}
                  className="card card-default"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 16px' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {s.name}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)' }}>{s.code}</span>
                    </span>
                    {details && <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{details}</span>}
                    <span>{statusBadge((s as any).onboardingStatus)}</span>
                  </div>
                  {active ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--state-success-fg)' }}>
                        <Check size={14} /> Active
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => onNavigate('/setup/station')}>Configure</Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" style={{ flexShrink: 0 }} onClick={() => onStationChange(s)}>Set active</Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'team' && <UserRolesAssignment />}

      {tab === 'activity' && <ActivityFeed stations={stations} />}

      {tab === 'profile' && <OrgProfile />}
    </PageLayout>
  );
};
