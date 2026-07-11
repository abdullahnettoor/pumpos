import React, { useState } from 'react';
import { Station } from '@pump/shared';
import { PageLayout } from '../primitives/PageLayout.js';
import { Tabs } from '../primitives/Tabs.js';
import { StatusBadge } from '../StatusBadge.js';
import { UserRolesAssignment } from '../StationSetup/UserRolesAssignment.js';
import { OrgProfile } from './OrgProfile.js';
import { ActivityFeed } from './ActivityFeed.js';
import { Check } from 'lucide-react';

export interface OrganizationOverviewProps {
  stations: Station[];
  selectedStation: Station | null;
  onStationChange: (station: Station) => void;
  onNavigate: (path: string) => void;
}

const statusBadge = (status?: string) => {
  switch (status) {
    case 'READY_FOR_OPERATIONS':
      return <StatusBadge status="Ready" type="success" />;
    case 'IN_PROGRESS':
      return <StatusBadge status="Setup In Progress" type="warning" />;
    default:
      return <StatusBadge status="Not Started" type="default" />;
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                      <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('/setup/station')}>Configure</button>
                    </div>
                  ) : (
                    <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={() => onStationChange(s)}>Set active</button>
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
