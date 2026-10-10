/**
 * What each tab shows as its own (root) screen. This is the plug-in point for
 * the tab tickets: replace a case below with the new screen (it renders its own
 * header: `PageHeader`, or `HomeHeader` on Home) and push detail pages with
 * `useNav().push`. The screens wired here are the pre-revamp ones, kept
 * working until their ticket replaces them.
 */
import React, { useState } from 'react';
import { resolveBusinessDate, type Station } from '@pump/shared';
import { BusinessDayPill } from '../components/BusinessDayPill.js';
import { HandoverPanel } from '../components/HandoverPanel.js';
import { DssrScreen } from '../screens/DssrScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { LedgerScreen } from '../screens/LedgerScreen.js';
import { MoreScreen } from '../screens/MoreScreen.js';
import { ShiftsScreen } from '../screens/ShiftsScreen.js';
import { PageHeader } from '../ui/PageHeader.js';
import { HomeHeader } from './HomeHeader.js';
import { useNav } from './nav.js';
import { tabDef, type TabKey } from './tabs.js';

interface Props {
  tab: TabKey;
  /** The selected station; null while stations load or when there are none. */
  station: Station | null;
  stationsLoading: boolean;
}

/** Pre-revamp screens assumed a padded page; keep that until they are rebuilt. */
const Padded: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 pb-4">{children}</div>
);

/** Interim Reports root: the day navigator moved here from the global header. */
const ReportsRoot: React.FC<{ station: Station }> = ({ station }) => {
  const settings: any = (station as any).settings || {};
  const today = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && picked <= today ? picked : today;
  return (
    <>
      <div className="pb-3">
        <BusinessDayPill value={date} max={today} onChange={setPicked} />
      </div>
      <DssrScreen station={station} businessDate={date} />
    </>
  );
};

export const TabRoot: React.FC<Props> = ({ tab, station, stationsLoading }) => {
  const nav = useNav();
  const header = tab === 'home' ? <HomeHeader /> : <PageHeader title={tabDef(tab).label} />;

  if (tab === 'handover')
    return (
      <>
        {header}
        <Padded>
          <HandoverPanel />
        </Padded>
      </>
    );
  if (tab === 'money')
    return (
      <>
        {header}
        <Padded>
          <LedgerScreen />
        </Padded>
      </>
    );

  if (!station)
    return (
      <>
        {header}
        <p className="px-4 py-10 text-center text-sm text-text-muted">
          {stationsLoading ? 'Loading stations…' : 'No stations available.'}
        </p>
      </>
    );

  const onNavigate = (target: TabKey) => nav.select(target);
  return (
    <>
      {header}
      <Padded>
        {tab === 'home' && (
          <HomeScreen station={station} businessDate={null} onNavigate={onNavigate} />
        )}
        {tab === 'shifts' && <ShiftsScreen station={station} />}
        {tab === 'reports' && <ReportsRoot station={station} />}
        {tab === 'insights' && <MoreScreen station={station} onNavigate={onNavigate} />}
      </Padded>
    </>
  );
};
