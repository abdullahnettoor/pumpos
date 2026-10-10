import { useCallback } from 'react';
import type { MobileAlert } from '../../lib/alerts.js';
import type { Station } from '@pump/shared';
import { useNav } from '../../shell/nav.js';
import type { TabKey } from '../../shell/tabs.js';
import { HandoverPage } from '../HandoverPage.js';
import { ShiftSummaryPage } from '../ShiftSummaryPage.js';
import { CustomerPage } from '../money/CustomerPage.js';
import { ReportDayPage } from '../reports/ReportDayPage.js';

/** The tab a page belongs to: a Role without it may not open the page. */
const OWNING_TAB: Record<string, TabKey | null> = {
  day: 'reports',
  customer: 'money',
  shift: 'shifts',
  handover: null,
};

/**
 * Opens the one page an alert explains, pushed on the current tab so back
 * returns to wherever the alert was tapped (Home or the Needs attention page).
 * Returns null for an alert with nothing to open: stock (no purchasing on
 * mobile), or a page the signed-in Role has no tab for. Page ids match the
 * pages' other entry points, so a double tap pushes once.
 *
 *   const open = useAlertOpener(station);
 *   const onPress = open(alert);   // (() => void) | null
 */
export function useAlertOpener(
  station: Station | null,
): (alert: MobileAlert) => (() => void) | null {
  const nav = useNav();

  return useCallback(
    (alert) => {
      const action = alert.action;
      if (!action) return null;
      const tab = OWNING_TAB[action.kind];
      if (tab && !nav.tabs.includes(tab)) return null;

      switch (action.kind) {
        case 'day':
          if (!station) return null;
          return () =>
            nav.push(
              <ReportDayPage station={station} businessDate={action.businessDate} />,
              `report:${action.businessDate}`,
            );
        case 'shift':
          if (!station) return null;
          return () =>
            nav.push(
              <ShiftSummaryPage station={station} shiftId={action.shiftId} />,
              `shift:${action.shiftId}`,
            );
        case 'customer':
          // A snapshot row, like the Money list's: the page reads the live entry itself.
          return () =>
            nav.push(<CustomerPage customer={action.customer} />, `customer:${action.customer.id}`);
        case 'handover':
          return () => nav.push(<HandoverPage />, 'handover');
      }
    },
    [nav, station],
  );
}
