import React from 'react';
import { inr } from '@pump/ui';
import { ListGroup, ListRow, SectionLabel, StatusBadge } from '../../ui/index.js';
import { formatRecordedTime, varianceBadge, type HandoverRecap } from './recap.js';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * After a recorded Handover: confirmation, the attendant's own figures, and the
 * way back in. Their manager closes the Shift, so until then it is editable.
 */
export const RecordedState: React.FC<{
  recap: HandoverRecap;
  shiftName: string | null | undefined;
  onEdit: () => void;
}> = ({ recap, shiftName, onEdit }) => {
  const badge = varianceBadge(recap.variance);
  const time = formatRecordedTime(recap.recordedAt);
  const subtitle = [recap.duNames.join(', '), shiftName, time, badge.label]
    .filter(Boolean)
    .join(' · ');
  // "2 slips + T1": the slips, then the terminals that took card/UPI.
  const cardsMeta = [
    recap.creditSlips > 0 ? plural(recap.creditSlips, 'slip') : null,
    recap.terminalLabels.length > 0 ? recap.terminalLabels.join(', ') : null,
    recap.terminalLabels.length === 0 && recap.hasAggregateCardUpi ? 'card / UPI' : null,
  ]
    .filter(Boolean)
    .join(' + ');

  return (
    <div className="-mx-4 flex flex-col gap-3">
      <section
        role="status"
        className="mx-3 rounded-2xl border border-transparent bg-good-soft px-4 py-[18px] text-center"
      >
        <span
          aria-hidden
          className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-full bg-good text-on-accent"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2 className="m-0 mt-2.5 text-lg font-extrabold text-text-high">Handover recorded</h2>
        <p className="m-0 mt-0.5 text-xs text-text-muted">{subtitle}</p>
      </section>

      <SectionLabel>Your summary</SectionLabel>
      <ListGroup>
        <ListRow
          title="Fuel sold"
          meta={`${Number(recap.fuelLitres.toFixed(2)).toLocaleString('en-IN')} L`}
          end={<span className="num">{inr(recap.fuelAmount)}</span>}
        />
        <ListRow
          title="Products"
          meta={recap.productQuantity > 0 ? plural(recap.productQuantity, 'item') : 'None sold'}
          end={<span className="num">{inr(recap.productAmount)}</span>}
        />
        <ListRow
          title="Credit & cards"
          meta={cardsMeta || 'None'}
          end={<span className="num">{inr(recap.creditAndCardAmount)}</span>}
        />
        <ListRow
          title="Cash drops"
          meta="taken by office"
          end={<span className="num">{inr(recap.cashDrops)}</span>}
        />
        <ListRow
          title="Cash handed over"
          meta={recap.openingFloat > 0 ? `includes ${inr(recap.openingFloat)} float` : 'in drawer'}
          end={<span className="num">{inr(recap.cashHandedOver)}</span>}
        />
        <ListRow
          title="Variance"
          end={
            <StatusBadge tone={badge.tone} num>
              {badge.label}
            </StatusBadge>
          }
        />
      </ListGroup>

      <button
        type="button"
        onClick={onEdit}
        className="mx-3 h-12 rounded-xl border border-line-strong bg-card text-sm font-semibold text-text-high"
      >
        Edit before shift closes
      </button>
      <p className="m-0 px-9 text-center text-[11px] text-text-muted">
        {shiftName ? `Your manager closes ${shiftName}.` : 'Your manager closes the shift.'} You can
        sign out now.
      </p>
    </div>
  );
};
