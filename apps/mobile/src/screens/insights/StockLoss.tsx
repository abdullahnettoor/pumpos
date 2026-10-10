import React from 'react';
import type { InsightsRangeDays } from '@pump/shared';
import { useInsightsStockLoss } from '@pump/ui';
import { signedRupees } from '../../lib/format.js';
import { stockLossLine } from '../../lib/insights/blocks.js';
import { ListGroup, StatusBadge, TONE_TEXT } from '../../ui/index.js';
import { BlockFrame } from './BlockFrame.js';

export const StockLoss: React.FC<{ stationId: string; days: InsightsRangeDays }> = ({
  stationId,
  days,
}) => {
  const q = useInsightsStockLoss(stationId, days);
  const rows = q.data ?? [];

  return (
    <BlockFrame
      title="Stock loss"
      right="tank dip vs book"
      isError={q.isError}
      loaded={!!q.data}
      onRetry={() => void q.refetch()}
      empty={q.data && rows.length === 0 ? 'No tank dips were recorded in this range.' : undefined}
    >
      <ListGroup>
        {rows.map((t) => {
          const line = stockLossLine(t);
          return (
            <div
              key={t.tankId}
              className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
            >
              <span className="grid h-[30px] place-items-center rounded-[9px] bg-track text-[10.5px] font-bold text-text-high">
                {t.productCode}
              </span>
              <div className="min-w-0">
                <p className={`num text-[13px] font-semibold ${TONE_TEXT[line.tone]}`}>
                  {line.litres}
                  <span className="ml-1.5 font-sans text-[11px] font-medium text-text-muted">
                    {t.tankName}
                  </span>
                </p>
                <p className="truncate text-[11px] text-text-muted">{line.note}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`num text-[13px] font-semibold ${TONE_TEXT[line.tone]}`}>
                  {signedRupees(t.valueAtCost, { plus: true })}
                </span>
                {line.outside && (
                  <StatusBadge tone={line.tone === 'bad' ? 'bad' : 'warn'}>Outside</StatusBadge>
                )}
              </div>
            </div>
          );
        })}
      </ListGroup>
      <p className="px-4 pt-1.5 text-[11px] text-text-faint">
        Rupees at cost basis. Tanks with a dip in this range only.
      </p>
    </BlockFrame>
  );
};
