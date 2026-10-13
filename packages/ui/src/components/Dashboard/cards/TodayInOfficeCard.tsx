import React, { useMemo } from 'react';
import { officeEntries } from './money/moneyModel.js';
import { formatMoney } from '../../../utils/format.js';
import { ledgerSourceLabel } from '../../../utils/ledgerLabels.js';
import { useDailyCashBook } from '../../../query/hooks.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { DashboardCard } from '../frame/DashboardCard.js';

/**
 * Money column card: Today in the office (#506).
 * Latest 3 Office Records of today's Entry Date as a table, with the entry count.
 * The Daily cash book › link lives once, in the Money column header.
 * Fails independently from the other Money cards.
 */
export const TodayInOfficeCard: React.FC = () => {
  const { station, entryDate } = useDashboard();
  const enabled = useCardEnabled('money');

  const cashBookQ = useDailyCashBook(station.id, entryDate, { enabled });

  const allEntries = useMemo(() => officeEntries(cashBookQ.data?.accounts), [cashBookQ.data]);

  const top3 = allEntries.slice(0, 3);
  const count = allEntries.length;

  return (
    <DashboardCard
      card="money"
      title="Today in the office"
      query={cashBookQ}
      placeholderHeight={140}
    >
      <div className="flex items-center justify-between pb-1.5 text-xs text-ink-muted">
        <span className="font-medium text-ink">Today in the office</span>
        {count > 0 && (
          <span data-testid="entries-count">
            {count} {count === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>
      {top3.length === 0 ? (
        <div className="text-[13px] text-ink-muted py-1" data-testid="empty-office-records">
          Nothing recorded yet today.
        </div>
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-soft text-[13px]"
          data-testid="office-records-list"
        >
          {top3.map((entry) => {
            const label = ledgerSourceLabel(entry.sourceType);
            const detail = entry.partyName || entry.notes || entry.accountName;
            const isIncome = entry.direction === 'in';
            return (
              <li
                key={entry.id}
                className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0"
              >
                <span className="truncate pr-2 text-ink">
                  <span className="font-medium">{label}</span>
                  {detail && <span className="text-ink-muted"> · {detail}</span>}
                </span>
                <span
                  className={`font-mono font-medium shrink-0 ${
                    isIncome ? 'text-success-fg' : 'text-danger-fg'
                  }`}
                >
                  {isIncome ? '+' : '−'}
                  {formatMoney(entry.amount, { decimals: 0 })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
};
