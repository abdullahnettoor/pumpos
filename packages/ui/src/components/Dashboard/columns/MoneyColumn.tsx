import React from 'react';
import { canSeeDashboardCard } from '@pump/shared';
import { useShiftStatus } from '../../../query/hooks.js';
import { MoneyCard } from '../cards/MoneyCard.js';
import { ReceivablesPayablesCard } from '../cards/ReceivablesPayablesCard.js';
import { TodayInOfficeCard } from '../cards/TodayInOfficeCard.js';
import { YourShiftCard } from '../cards/YourShiftCard.js';
import { ColumnHeader } from '../frame/ColumnHeader.js';
import { useDashboard } from '../frame/DashboardContext.js';
import { formatClockInZone } from '../../../utils/format.js';

/** Staff's "Your shift" header (same query key as YourShiftCard: no extra request). */
const YourShiftHeader: React.FC = () => {
  const { station, timeZone } = useDashboard();
  const status = useShiftStatus(station.id);
  const shift = status.data?.activeShift as
    { shiftSequence?: number; openedAt?: string } | null | undefined;
  const subtitle = shift?.openedAt
    ? `${shift.shiftSequence ? `Shift ${shift.shiftSequence} · ` : ''}since ${formatClockInZone(shift.openedAt, timeZone)}`
    : 'no shift open';
  return <ColumnHeader title="Your shift" subtitle={subtitle} />;
};

/** Third column: Money (Owner/Manager/Accountant) or Your shift (Staff, in Money's place) (#506). */
export const MoneyColumn: React.FC = () => {
  const { role, onNavigate } = useDashboard();
  const showMoney = canSeeDashboardCard('money', role);
  const showYourShift = canSeeDashboardCard('yourShift', role);
  return (
    <>
      {showMoney && (
        <>
          <ColumnHeader
            title="Money"
            subtitle="office records by entry date"
            action={{
              label: 'Cash Book',
              onClick: () => onNavigate('/reports', { openReportsTab: 'cash-book' }),
            }}
          />
          <MoneyCard />
          <ReceivablesPayablesCard />
          <TodayInOfficeCard />
        </>
      )}
      {showYourShift && (
        <>
          <YourShiftHeader />
          <YourShiftCard />
        </>
      )}
    </>
  );
};
