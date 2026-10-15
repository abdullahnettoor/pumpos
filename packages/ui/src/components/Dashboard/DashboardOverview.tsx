import React, { useState } from 'react';
import { useCustomers, useDesktopDownloads, useSuppliers, useUsers } from '../../query/hooks.js';
import {
  GettingStartedChecklist,
  isStepComplete,
  type ChecklistStep,
} from './GettingStartedChecklist.js';
import { useChecklistSkips } from './checklistStorage.js';
import {
  desktopOptionsForThisBrowser,
  markDesktopDownloaded,
  readDesktopDownloaded,
  startDownload,
} from '../Desktop/desktopDownload.js';
import { isDesktopApp } from '../../utils/platform.js';
import { Button, PageHeader, EmptyState } from '../../pump-ds/index.js';
import { Station, canOnboardStation, canViewReports, type OperatorRole } from '@pump/shared';
import { STATION_SETUP_IN_PROGRESS } from '../StationSetup/StationOnboardingLockout.js';
import type { NavIntent } from '../AppShell.js';
import { TriangleAlert, Fuel, Users } from 'lucide-react';
import { Dashboard } from './frame/Dashboard.js';
import { ROUTES } from '../../nav-intent/routes.js';

interface DashboardOverviewProps {
  selectedStation: Station | null;
  userRole: OperatorRole;
  userName: string;
  onNavigate: (path: string, intent?: NavIntent) => void;
}

const GS_DISMISSED_KEY = 'pumpos_gs_dismissed';

const OPTIONAL_STEP_IDS = ['team', 'suppliers', 'customers', 'desktop'];

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  selectedStation,
  userRole,
  userName,
  onNavigate,
}) => {
  const canSeeFinancials = canViewReports(userRole);
  const { data: customers } = useCustomers(true, { enabled: canSeeFinancials });
  const { data: suppliers } = useSuppliers(true, { enabled: canSeeFinancials });
  const [gsDismissed, setGsDismissed] = useState(() => {
    try {
      return localStorage.getItem(GS_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const dismissGettingStarted = () => {
    try {
      localStorage.setItem(GS_DISMISSED_KEY, '1');
    } catch {
      /* storage blocked */
    }
    setGsDismissed(true);
  };
  const { data: users } = useUsers();
  const {
    skipped: skippedSteps,
    skip: skipStep,
    undoSkip: undoSkipStep,
  } = useChecklistSkips(selectedStation?.organizationId ?? 'no-organization');
  // Getting-started steps (data-driven; shared by the pre-ready hero and the
  // post-ready "Get started" checklist). Null-safe so a fresh org with NO
  // station yet still shows the hero. Customer/supplier steps only unlock once
  // the station is live (those screens are hidden pre-ready).
  const isReadyStation =
    !!selectedStation && (selectedStation as any).onboardingStatus === 'READY_FOR_OPERATIONS';
  const stationInProgress =
    !!selectedStation && (selectedStation as any).onboardingStatus === 'IN_PROGRESS';
  const canManageOnboarding = canOnboardStation(userRole);
  const showDesktopStep = canManageOnboarding && isReadyStation && !isDesktopApp();
  const { data: desktopDownloads } = useDesktopDownloads({ enabled: showDesktopStep });
  const [desktopDownloaded, setDesktopDownloaded] = useState(readDesktopDownloaded);
  const recommendedDesktop = desktopDownloads
    ? desktopOptionsForThisBrowser(desktopDownloads).find(
        (o) => o.recommended && o.download.available,
      )
    : undefined;
  const gsSteps: ChecklistStep[] = [
    {
      id: 'org',
      label: 'Create your organization',
      description: 'Your account and organization are set up.',
      done: true,
      actionLabel: 'Done',
      onAction: () => {},
    },
    {
      id: 'station',
      label: 'Onboard your station',
      description: 'Set up fuels, tanks, dispensers and opening values.',
      done: isReadyStation,
      actionLabel: stationInProgress ? 'Resume' : 'Onboard',
      onAction: () => onNavigate('/onboarding'),
    },
    {
      id: 'team',
      label: 'Invite your team',
      description: 'Add managers and staff so they can log in.',
      done: (users?.length ?? 0) > 1,
      actionLabel: 'Invite',
      onAction: () => onNavigate('/organization'),
    },
    {
      id: 'suppliers',
      label: 'Add suppliers',
      description: 'Record fuel and product suppliers.',
      done: (suppliers?.length ?? 0) > 0,
      locked: !isReadyStation,
      lockedHint: 'Available once your station is live.',
      actionLabel: 'Add',
      onAction: () => onNavigate(ROUTES.suppliers),
    },
    {
      id: 'customers',
      label: 'Add customers',
      description: 'Track credit customers and fleet accounts.',
      done: (customers?.length ?? 0) > 0,
      locked: !isReadyStation,
      lockedHint: 'Available once your station is live.',
      actionLabel: 'Add',
      onAction: () => onNavigate('/customers', { open: 'new-customer' }),
    },
    ...(showDesktopStep
      ? [
          {
            id: 'desktop',
            label: 'Install the desktop app',
            description: 'Faster on the counter PC, and it updates itself.',
            done: desktopDownloaded,
            actionLabel: recommendedDesktop ? 'Download' : 'See options',
            onAction: () => {
              if (recommendedDesktop && recommendedDesktop.download.available) {
                markDesktopDownloaded();
                setDesktopDownloaded(true);
                startDownload(recommendedDesktop.download.url);
              } else {
                onNavigate('/organization', { openOrganizationTab: 'desktop' });
              }
            },
          } satisfies ChecklistStep,
        ]
      : []),
  ].map((step) =>
    OPTIONAL_STEP_IDS.includes(step.id)
      ? {
          ...step,
          skippable: true,
          skipped: skippedSteps.includes(step.id),
          onSkip: () => skipStep(step.id),
          onUndoSkip: () => undoSkipStep(step.id),
        }
      : step,
  );

  // No station yet OR a station that isn't operational → native getting-started
  // hero on the dashboard (home). Owner/Manager can act on it; other roles just
  // wait for the Owner to finish setup.
  if (!isReadyStation) {
    if (!canManageOnboarding) {
      return (
        <div className="animate-fade-in flex flex-col gap-5">
          <PageHeader title="Dashboard" />
          <EmptyState
            icon={<TriangleAlert />}
            title={STATION_SETUP_IN_PROGRESS.title}
            description={STATION_SETUP_IN_PROGRESS.description}
          />
        </div>
      );
    }
    const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';
    const subtitle = selectedStation
      ? `${selectedStation.name} · ${selectedStation.code}`
      : undefined;
    return (
      <div className="animate-fade-in flex flex-col gap-5">
        <PageHeader title="Dashboard" subtitle={subtitle} />
        <div className="flex flex-col items-start gap-4 rounded-card border border-border-soft bg-surface p-7">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>
              Welcome, {firstName}
            </span>
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                maxWidth: '620px',
              }}
            >
              {stationInProgress
                ? 'Your station setup is in progress. Pick up where you left off to bring it online.'
                : 'Bring your station online to unlock shifts, sales, inventory and reports. Setup takes a few minutes and is done right here.'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Fuel size={14} />}
              onClick={() => onNavigate('/onboarding')}
            >
              {stationInProgress ? 'Resume setup' : 'Onboard your station'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Users size={14} />}
              onClick={() => onNavigate('/organization')}
            >
              Invite your team
            </Button>
          </div>
        </div>
        <GettingStartedChecklist steps={gsSteps} />
      </div>
    );
  }

  // Past this point the station is operational — narrow for TypeScript.
  if (!selectedStation) return null;

  // A freshly-onboarded (but ready) station: show the getting-started checklist
  // above the board until the essentials are done or the user dismisses it.
  const showGettingStarted =
    canManageOnboarding && !gsDismissed && gsSteps.some((s) => !isStepComplete(s));

  return (
    <Dashboard
      station={selectedStation}
      role={userRole}
      userName={userName}
      onNavigate={onNavigate}
      aboveBoard={
        showGettingStarted ? (
          <GettingStartedChecklist steps={gsSteps} dismissible onDismiss={dismissGettingStarted} />
        ) : null
      }
    />
  );
};
