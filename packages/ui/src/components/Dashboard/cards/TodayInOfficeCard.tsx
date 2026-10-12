import React, { useMemo } from 'react';
import { officeEntries } from './money/moneyModel.js';
import { formatMoney } from '../../../utils/format.js';
import { ledgerSourceLabel } from '../../../utils/ledgerLabels.js';
import { useDailyCashBook } from '../../../query/hooks.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { DashboardCard } from '../frame/DashboardCard.js';

/**
 * Money column card: Today in the office (#506).
 * Shows the latest 3 Office Records of today's Entry Date, total count, and Cash Book › link.
 * Fails independently from the other Money cards.
 */
export const TodayInOfficeCard: React.FC = () => {
  const { station, entryDate, onNavigate } = useDashboard();
  const enabled = useCardEnabled('money');

  const cashBookQ = useDailyCashBook(station.id, entryDate, { enabled });

  const allEntries = useMemo(() => officeEntries(cashBookQ.data?.accounts), [cashBookQ.data]);

  const top3 = allEntries.slice(0, 3);
  const count = allEntries.length;

  const headerAction = (
    <div className="flex items-center gap-1.5 text-xs">
      {count > 0 && (
        <span className="text-ink-muted" data-testid="entries-count">
          {count} {count === 1 ? 'entry' : 'entries'} ·
        </span>
      )}
      <button
        type="button"
        onClick={() => onNavigate('/reports', { openReportsTab: 'cash-book' })}
        className="text-brand hover:underline font-medium"
      >
        Cash Book ›
      </button>
    </div>
  );

  return (
    <DashboardCard
      card="money"
      title="Today in the office"
      query={cashBookQ}
      action={headerAction}
      placeholderHeight={140}
    >
      {top3.length === 0 ? (
        <div className="text-xs text-ink-muted py-1" data-testid="empty-office-records">
          Nothing recorded yet today.
        </div>
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-soft text-xs"
          data-testid="office-records-list"
        >
          {top3.map((entry) => {
            const label = ledgerSourceLabel(entry.sourceType);
            const detail = entry.notes || entry.accountName;
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
                    isIncome ? 'text-state-success-fg' : 'text-state-danger-fg'
                  }`}
                >
                  {isIncome ? '+' : '-'}
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
