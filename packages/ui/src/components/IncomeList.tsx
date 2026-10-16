import React from 'react';
import { can, principalOf } from '@pump/shared';
import { ROUTES } from '../nav-intent/routes.js';
import type { NavIntent } from '../nav-intent/store.js';
import { Button } from '../pump-ds/index.js';
import { CategoryRecordPage } from './categories/CategoryRecordPage.js';
import { IncomeGstPanel } from './reports/gst/IncomeGstPanel.js';

interface IncomeListProps {
  selectedStation: any | null;
  userRole?: string;
  /** Shell navigation, for the link to Reports → GST (income output GST lives there). */
  onNavigate?: (path: string, intent?: NavIntent) => void;
}

/**
 * Income: the shared Expense / Income page with `kind="income"` (#529).
 *
 * Income GST lives in Reports → GST (#540), but Reports is not every Income
 * role's page: Staff record income and always saw its output GST here. Roles
 * that can reach Reports get the link; the rest keep a GST tab, so the move
 * changes where it is, never who sees it.
 */
export const IncomeList: React.FC<IncomeListProps> = ({
  selectedStation,
  userRole,
  onNavigate,
}) => {
  const reportsGst = can(principalOf(userRole), 'reports.view');
  return (
    <CategoryRecordPage
      kind="income"
      selectedStation={selectedStation}
      userRole={userRole}
      actions={
        reportsGst &&
        onNavigate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onNavigate(ROUTES.reports, { openReportsTab: 'gst', openGstView: 'income' })
            }
          >
            GST in Reports ›
          </Button>
        )
      }
      extraViews={
        reportsGst
          ? []
          : [
              {
                tab: { id: 'gst', label: 'GST', concept: 'gst' },
                render: () => <IncomeGstPanel selectedStation={selectedStation} />,
              },
            ]
      }
    />
  );
};
