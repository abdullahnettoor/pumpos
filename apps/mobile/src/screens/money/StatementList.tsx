import React from 'react';
import { inr } from '@pump/ui';
import { signedMoney } from '../../lib/format.js';
import type { Statement } from '../../lib/money/statement.js';
import { MinusIcon, PlusIcon } from '../../ui/icons.js';

/**
 * What an entry does to the balance: one that adds to it (Credit Sale, Purchase)
 * is amber, one that reduces it (Collection, Supplier Payment) is green.
 */
const ENTRY_TONE = {
  raises: { badge: 'border-warn-line bg-warn-soft text-warn-fg', amount: 'text-warn-fg' },
  reduces: { badge: 'border-good-line bg-good-soft text-good', amount: 'text-good' },
} as const;

/** Statement of a Customer: months newest first, each row with its running balance. */
export const StatementList: React.FC<{
  statement: Statement;
  onLoadMore: () => void;
  /** After the last month and before the count: the balance brought forward of a windowed statement. */
  trailing?: React.ReactNode;
}> = ({ statement, onLoadMore, trailing }) => (
  <div className="mx-3 overflow-hidden rounded-[14px] border border-line bg-card">
    {!statement.reconciled && (
      <p
        role="note"
        className="border-b border-warn-line bg-warn-soft px-3 py-2 text-[11.5px] text-text-high"
      >
        Partial statement: these entries don’t add up to the current balance, so running balances
        are hidden. The balance above is the one on record.
      </p>
    )}
    {statement.months.map((m) => (
      <section key={m.key} aria-label={m.label}>
        <h3 className="border-b border-line bg-card-alt px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-text-muted [section:not(:first-child)>&]:border-t">
          {m.label}
        </h3>
        <ul className="[&>li+li]:border-t [&>li+li]:border-line">
          {m.entries.map((e) => {
            const reduces = e.delta < 0;
            const tone = reduces ? ENTRY_TONE.reduces : ENTRY_TONE.raises;
            const Sign = reduces ? MinusIcon : PlusIcon;
            return (
              <li key={e.key} className="flex items-center gap-2.5 px-3 py-2.5">
                <span
                  aria-hidden="true"
                  data-sign={reduces ? 'reduces' : 'raises'}
                  className={`grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full border ${tone.badge}`}
                >
                  <Sign size={14} strokeWidth={2.6} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text-high">{e.label}</p>
                  {e.meta && <p className="truncate text-[11px] text-text-muted">{e.meta}</p>}
                  {e.detail && <p className="truncate text-[11px] text-text-muted">{e.detail}</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`num text-[13.5px] font-semibold ${tone.amount}`}>
                    {reduces ? '−' : '+'}
                    {inr(Math.abs(e.delta))}
                  </p>
                  {e.balance !== null && (
                    <p className="num text-[11px] text-text-muted">Bal {signedMoney(e.balance)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
    {!statement.hasMore && trailing}
    <div className="border-t border-line px-3 py-3 text-center text-[11.5px] text-text-muted">
      Showing {statement.shown} of {statement.total} {statement.total === 1 ? 'entry' : 'entries'}
      {statement.hasMore && (
        <>
          {' · '}
          <button type="button" onClick={onLoadMore} className="font-bold text-accent">
            Load more
          </button>
        </>
      )}
    </div>
  </div>
);
