/**
 * What each tab shows as its own (root) screen. This is the plug-in point for
 * the tab tickets: replace a case below with the new screen (it renders its own
 * header: `TabHeader`, or `HomeHeader` on Home) and push detail pages with
 * `useNav().push`. The screens wired here are the pre-revamp ones, kept
 * working until their ticket replaces them.
 */
import React from 'react';
import type { Station } from '@pump/shared';
import { HandoverPanel } from '../components/HandoverPanel.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { LedgerScreen } from '../screens/LedgerScreen.js';
import { MoreScreen } from '../screens/MoreScreen.js';
import { ReportsScreen } from '../screens/ReportsScreen.js';
import { ShiftsScreen } from '../screens/ShiftsScreen.js';
import { HomeHeader } from './HomeHeader.js';
import { useNav } from './nav.js';
import { TabHeader } from './TabHeader.js';
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

export const TabRoot: React.FC<Props> = ({ tab, station, stationsLoading }) => {
  const nav = useNav();
  const header = tab === 'home' ? <HomeHeader /> : <TabHeader title={tabDef(tab).label} />;

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

  // Home lays out its own sections (cards inset 12px, labels 16px); the rest still use the padded page.
  if (tab === 'home')
    return (
      <>
        {header}
        <HomeScreen station={station} />
      </>
    );

  const onNavigate = (target: TabKey) => nav.select(target);
  return (
    <>
      {header}
      <Padded>
        {tab === 'shifts' && <ShiftsScreen station={station} />}
        {tab === 'reports' && <ReportsScreen station={station} />}
        {tab === 'insights' && <MoreScreen station={station} onNavigate={onNavigate} />}
      </Padded>
    </>
  );
};
