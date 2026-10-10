import React from 'react';
import type { InsightsCreditHealth, InsightsRangeDays } from '@pump/shared';
import { useInsightsCreditHealth } from '@pump/ui';
import { compactRupees } from '../../lib/format.js';
import { creditBars } from '../../lib/insights/blocks.js';
import { percent } from '../../lib/insights/format.js';
import { ChangeBadge } from './ChangeBadge.js';
import { BlockFrame } from './BlockFrame.js';

const Bar: React.FC<{ label: string; amount: number; width: number; fill: string }> = ({
  label,
  amount,
  width,
  fill,
}) => (
  <>
    <div className="flex justify-between text-xs text-text-muted">
      <span>{label}</span>
      <b className="num font-semibold text-text-high">{compactRupees(amount)}</b>
    </div>
    <div aria-hidden="true" className="mb-2.5 mt-1.5 h-2 overflow-hidden rounded-full bg-track">
      <i className={`block h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  </>
);

/**
 * Credit given against collected, in plain words. It is NOT the movement of the
 * receivables book: customer balance adjustments are not in it, so it never
 * says "receivables grew".
 */
const Summary: React.FC<{ d: InsightsCreditHealth; days: number }> = ({ d, days }) => (
  <p className="text-xs text-text-muted">
    {d.receivablesChange > 0 ? (
      <>
        Credit given exceeded collections by{' '}
        <b className="num font-semibold text-warn-fg">{compactRupees(d.receivablesChange)}</b>
      </>
    ) : d.receivablesChange < 0 ? (
      <>
        Collections exceeded credit given by{' '}
        <b className="num font-semibold text-good">{compactRupees(-d.receivablesChange)}</b>
      </>
    ) : (
      <>Credit given and collected were equal</>
    )}{' '}
    in {days} days
    {d.creditShareOfSales !== null && (
      <>
        {' '}
        · credit is{' '}
        <b className="num font-semibold text-text-high">{percent(d.creditShareOfSales)}</b> of sales
      </>
    )}
  </p>
);

export const CreditHealth: React.FC<{ stationId: string; days: InsightsRangeDays }> = ({
  stationId,
  days,
}) => {
  const q = useInsightsCreditHealth(stationId, days);
  const d = q.data;
  const bars = d ? creditBars(d.creditGiven, d.collected) : { given: 0, collected: 0 };

  return (
    <BlockFrame
      title="Credit health"
      right={`${days} days`}
      isError={q.isError}
      loaded={!!d}
      onRetry={() => void q.refetch()}
      empty={
        d && d.creditGiven === 0 && d.collected === 0
          ? 'No credit given or collected in this range.'
          : undefined
      }
    >
      {d && (
        <div className="mx-3 rounded-[14px] border border-line bg-card p-3">
          <Bar label="Given on credit" amount={d.creditGiven} width={bars.given} fill="bg-warn" />
          <Bar label="Collected" amount={d.collected} width={bars.collected} fill="bg-good" />
          <Summary d={d} days={days} />
          {d.creditGivenChangePct !== null && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
              Credit given
              <ChangeBadge changePct={d.creditGivenChangePct} days={days} inverse />
            </div>
          )}
          <p className="mt-2 text-[11px] text-text-faint">
            Credit by Business Date, collections by the date they were entered.
          </p>
        </div>
      )}
    </BlockFrame>
  );
};
