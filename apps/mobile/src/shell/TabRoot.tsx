/**
 * What each tab shows as its own (root) screen. This is the plug-in point for
 * the tab tickets: replace a case below with the new screen (it renders its own
 * header: `TabHeader`, or `HomeHeader` on Home) and push detail pages with
 * `useNav().push`. The screens wired here are the pre-revamp ones, kept
 * working until their ticket replaces them.
 */
import React from 'react';
import { canViewMobileHome, canViewMobileInsights, type Station } from '@pump/shared';
import { HomeScreen } from '../screens/HomeScreen.js';
import { HandoverCard } from '../screens/home/HandoverCard.js';
import { HomeAttention } from '../screens/home/HomeAttention.js';
import { useMobileAlerts } from '../lib/alerts.js';
import { InsightsScreen } from '../screens/InsightsScreen.js';
import { MoneyScreen } from '../screens/MoneyScreen.js';
import { ReportsScreen } from '../screens/ReportsScreen.js';
import { SupplierPage } from '../screens/money/SupplierPage.js';
import { ShiftsScreen } from '../screens/ShiftsScreen.js';
import { useShell } from './context.js';
import { HomeHeader } from './HomeHeader.js';
import { TabHeader } from './TabHeader.js';
import { tabDef, type TabKey } from './tabs.js';

interface Props {
  tab: TabKey;
  /** The selected station; null while stations load or when there are none. */
  station: Station | null;
  stationsLoading: boolean;
}

/** Home's attention section for a Role whose Home is only its handover card. */
const HandoverHomeAttention: React.FC<{ station: Station | null }> = ({ station }) => {
  const alerts = useMobileAlerts(station);
  return <HomeAttention alerts={alerts} />;
};

export const TabRoot: React.FC<Props> = ({ tab, station, stationsLoading }) => {
  const { role } = useShell();
  // Home is the owner's overview. A Manager, Accountant or Staff member who mans a
  // pump gets Home only for their handover card (see `tabsForRole`).
  const handoverOnlyHome = tab === 'home' && !canViewMobileHome(role);
  // The bell needs an attention section to land on; a Role that may see alerts
  // (Manager) gets both beside its card, any other gets neither.
  const alertsOnHome = handoverOnlyHome && canViewMobileInsights(role);
  const header =
    tab === 'home' && (!handoverOnlyHome || alertsOnHome) ? (
      <HomeHeader />
    ) : (
      <TabHeader title={tabDef(tab).label} />
    );

  if (handoverOnlyHome)
    return (
      <>
        {header}
        <HandoverCard />
        {alertsOnHome && <HandoverHomeAttention station={station} />}
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
