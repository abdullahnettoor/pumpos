import React from 'react';
import type { Station } from '@pump/shared';
import { DetailPage } from '../../ui/index.js';
import { DssrScreen } from '../DssrScreen.js';
import { shortDate } from '../../lib/reports/days.js';

/**
 * Seam for the full DSSR page (#395): the Reports list pushes this for a Draft or
 * Sealed day. Until #395 replaces the body, it shows the existing DSSR view.
 */
export const ReportDayPage: React.FC<{ station: Station; businessDate: string }> = ({
  station,
  businessDate,
}) => (
  <DetailPage title="DSSR" subtitle={shortDate(businessDate)}>
    <div className="px-4">
      <DssrScreen station={station} businessDate={businessDate} />
    </div>
  </DetailPage>
);
