import React from 'react';
import { inr } from '@pump/ui';
import { varianceBadge, type HandoverRecap } from './recap.js';

const BADGE_TONE = {
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad-fg',
  warn: 'bg-warn-soft text-warn-fg',
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const formatTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
};

const Row: React.FC<{ title: string; meta: string; value: string }> = ({ title, meta, value }) => (
  <li className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
    <div className="min-w-0 flex-1">
      <p className="m-0 text-[13px] font-semibold text-text-high">{title}</p>
      <p className="m-0 truncate text-[11px] text-text-muted">{meta}</p>
    </div>
    <span className="num flex-shrink-0 text-sm font-semibold text-text-high">{value}</span>
  </li>
);

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
  const time = formatTime(recap.recordedAt);
  const subtitle = [recap.duNames.join(', '), shiftName, time, badge.label]
    .filter(Boolean)
    .join(' · ');
  const cardsMeta = [
    recap.creditSlips > 0 ? plural(recap.creditSlips, 'slip') : null,
    recap.hasCardUpi ? 'card / UPI' : null,
  ]
    .filter(Boolean)
    .join(' + ');

  return (
    <div className="flex flex-col gap-3">
      <section
        role="status"
        className="rounded-2xl border border-transparent bg-good-soft px-4 py-[18px] text-center"
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

      <h3 className="m-0 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
        Your summary
      </h3>
      <ul className="m-0 list-none overflow-hidden rounded-2xl border border-line bg-card p-0">
        <Row
          title="Fuel sold"
          meta={`${Number(recap.fuelLitres.toFixed(2)).toLocaleString('en-IN')} L`}
          value={inr(recap.fuelAmount)}
        />
        <Row
          title="Products"
          meta={recap.productQuantity > 0 ? plural(recap.productQuantity, 'item') : 'None sold'}
          value={inr(recap.productAmount)}
        />
        <Row
          title="Credit & cards"
          meta={cardsMeta || 'None'}
          value={inr(recap.creditAndCardAmount)}
        />
        <Row title="Cash drops" meta="taken by office" value={inr(recap.cashDrops)} />
        <Row
          title="Cash handed over"
          meta={recap.openingFloat > 0 ? `includes ${inr(recap.openingFloat)} float` : 'in drawer'}
          value={inr(recap.cashHandedOver)}
        />
        <li className="flex items-center gap-3 bg-card-alt px-3.5 py-3">
          <p className="m-0 flex-1 text-[13px] font-semibold text-text-high">Variance</p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${BADGE_TONE[badge.tone]}`}
          >
            {badge.label}
          </span>
        </li>
      </ul>

      <button
        type="button"
        onClick={onEdit}
        className="h-12 rounded-xl border border-line-strong bg-card text-sm font-semibold text-text-high"
      >
        Edit before shift closes
      </button>
      <p className="m-0 px-6 text-center text-[11px] text-text-muted">
        {shiftName ? `Your manager closes ${shiftName}.` : 'Your manager closes the shift.'} You can
        sign out now.
      </p>
    </div>
  );
};
