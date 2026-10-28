/**
 * What each tab shows as its own (root) screen. A tab's screen renders under
 * the header chosen here (`TabHeader`, or `HomeHeader` on Home) and pushes
 * detail pages with `useNav().push`. A tab that is added or retired is edited
 * here, in `tabs.ts` and in `tabIcons.tsx`.
 */
import React from 'react';
import { can, type Station } from '@pump/shared';
import { principalFor } from '@pump/ui';
import { HomeScreen } from '../screens/HomeScreen.js';
import { HandoverCard } from '../screens/home/HandoverCard.js';
import { InsightsScreen } from '../screens/InsightsScreen.js';
import { MoneyScreen } from '../screens/MoneyScreen.js';
import { ReportsScreen } from '../screens/ReportsScreen.js';
import { SupplierPage } from '../screens/money/SupplierPage.js';
import { ShiftsScreen } from '../screens/ShiftsScreen.js';
import { useShell } from './context.js';
import { HomeHeader } from './HomeHeader.js';
import { TabHeader } from './TabHeader.js';
import { tabDef } from './tabs.js';
import type { TabKey } from '../lib/tabKey.js';
import { DensityPage } from '../screens/density/DensityPage.js';
import { useNav } from './nav.js';

interface Props {
  tab: TabKey;
  /** The selected station; null while stations load or when there are none. */
  station: Station | null;
  stationsLoading: boolean;
}

export const TabRoot: React.FC<Props> = ({ tab, station, stationsLoading }) => {
  const { role } = useShell();
  const nav = useNav();
  // Home is the overview for Owner and Manager (`canViewMobileHome`), with the
  // pinned handover card when they man a pump. An Accountant or Staff member who
  // mans a pump gets Home only for that card (see `tabsForRole`): no overview, no
  // bell (neither Role may see alerts).
  const showDensityShortcut = can(principalFor(role), 'mobile.densityShortcut');
  const handoverOnlyHome = tab === 'home' && !can(principalFor(role), 'mobile.home');
  const header =
    tab === 'home' && !handoverOnlyHome ? <HomeHeader /> : <TabHeader title={tabDef(tab).label} />;

  if (handoverOnlyHome)
    return (
      <>
        {showDensityShortcut ? <TabHeader title={tabDef(tab).label} /> : header}
        {showDensityShortcut && tab === 'home' && (
          <div className="px-3 pt-2">
            <button
              type="button"
              className="hit-44 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-accent"
              onClick={() => nav.push(<DensityPage />, 'density')}
            >
              Density register
            </button>
          </div>
        )}
        <HandoverCard />
      </>
    );
  if (tab === 'money')
    return (
      <>
        {header}
        <MoneyScreen
          station={station}
          renderSupplierPage={(s) => <SupplierPage supplier={s} station={station} />}
        />
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

  // Every tab lays out its own sections (cards inset 12px, labels 16px).
  if (tab === 'home')
    return (
      <>
        {header}
        <HomeScreen station={station} role={role} />
      </>
    );

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
