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
import { InsightsScreen } from '../screens/InsightsScreen.js';
import { MoneyScreen } from '../screens/MoneyScreen.js';
import { ReportsScreen } from '../screens/ReportsScreen.js';
import { SupplierPage } from '../screens/money/SupplierPage.js';
import { ShiftsScreen } from '../screens/ShiftsScreen.js';
import { HomeHeader } from './HomeHeader.js';
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
        <MoneyScreen renderSupplierPage={(s) => <SupplierPage supplier={s} />} />
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

  // Home and Shifts lay out their own sections (cards inset 12px, labels 16px); the rest still use the padded page.
  if (tab === 'home')
    return (
      <>
        {header}
        <HomeScreen station={station} />
      </>
    );

  // Shifts, like Home, lays out its own sections.
  if (tab === 'shifts')
    return (
      <>
        {header}
        <ShiftsScreen station={station} />
      </>
    );

  if (tab === 'insights')
    return (
      <>
        {header}
        <InsightsScreen station={station} />
      </>
    );

  // Reports lays out its own sections too (tiles and lists inset 12px).
  if (tab === 'reports')
    return (
      <>
        {header}
        <ReportsScreen station={station} />
      </>
    );

  // Every tab is wired above; a new TabKey lands here with just its header.
  return <>{header}</>;
};
