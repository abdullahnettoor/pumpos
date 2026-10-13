import React from 'react';
import { formatCompactMoney, formatMoney } from '../../../utils/format.js';
import { MONEY_TERMS } from '../../../utils/moneyTerms.js';
import { usePayables, useReceivables } from '../../../query/hooks.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { DashboardCard } from '../frame/DashboardCard.js';

/**
 * Money column card: Receivable / Payable (#506, naming #519).
 * Fails independently from the other Money cards.
 */
export const ReceivablesPayablesCard: React.FC = () => {
  const { station, onNavigate } = useDashboard();
  const enabled = useCardEnabled('money');

  const receivablesQ = useReceivables(station.id, { enabled });
  const payablesQ = usePayables(station.id, { enabled });

  const receivables = receivablesQ.data;
  const payables = payablesQ.data;

  const totalReceivables = receivables?.total ?? 0;
  const totalPayables = payables?.total ?? 0;
  const hasNoCreditCustomers = (receivables?.customerCount ?? 0) === 0 && totalReceivables === 0;

  const aging = receivables?.aging;
  const d0_7 = aging?.d0_7 ?? 0;
  const d8_30 = aging?.d8_30 ?? 0;
  const d30plus = aging?.d30plus ?? 0;
  const agingSum = d0_7 + d8_30 + d30plus || totalReceivables || 1;
  const p1 = (d0_7 / agingSum) * 100;
  const p2 = (d8_30 / agingSum) * 100;
  const p3 = (d30plus / agingSum) * 100;

  return (
    <DashboardCard
      card="money"
      title={`${MONEY_TERMS.receivable} / ${MONEY_TERMS.payable}`}
      query={[receivablesQ, payablesQ]}
      placeholderHeight={130}
    >
      <div className="flex flex-col gap-2.5">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {MONEY_TERMS.receivable}
            </span>
            <span
              className={`font-mono text-base font-semibold ${
                totalReceivables > 0 ? 'text-warning-fg' : 'text-ink'
              }`}
              data-testid="receivables-total"
            >
              {formatMoney(totalReceivables, { decimals: 0 })}
            </span>
          </div>

          {hasNoCreditCustomers ? (
            <div className="text-xs text-ink-muted mt-1">
              No credit customers yet ·{' '}
              <button
                type="button"
                onClick={() => onNavigate('/customers', { open: 'new-customer' })}
                className="text-brand hover:underline font-medium"
              >
                Add customer ›
              </button>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-col gap-1">
              <div
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
                role="progressbar"
                aria-label="Receivables aging"
              >
                {p1 > 0 && <div style={{ width: `${p1}%` }} className="bg-success-fg" />}
                {p2 > 0 && <div style={{ width: `${p2}%` }} className="bg-warning-fg" />}
                {p3 > 0 && <div style={{ width: `${p3}%` }} className="bg-danger-fg" />}
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted">
                <span>
                  0–7d{' '}
                  <strong className="font-mono font-medium text-ink">
                    {formatCompactMoney(d0_7)}
                  </strong>
                </span>
                <span>
                  8–30d{' '}
                  <strong className="font-mono font-medium text-ink">
                    {formatCompactMoney(d8_30)}
                  </strong>
                </span>
                <span className={d30plus > 0 ? 'text-danger-fg' : ''}>
                  30d+{' '}
                  <strong className="font-mono font-medium">{formatCompactMoney(d30plus)}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-border-soft flex items-baseline justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {MONEY_TERMS.payable}
          </span>
          <span className="font-mono text-sm font-medium text-ink" data-testid="payables-total">
            {formatMoney(totalPayables, { decimals: 0 })}
          </span>
        </div>
      </div>
    </DashboardCard>
  );
};
