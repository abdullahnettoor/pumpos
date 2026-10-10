import React from 'react';
import { inr } from '@pump/ui';
import { signedRupees } from '../../lib/money/format.js';
import type { Statement } from '../../lib/money/statement.js';

/** Statement of a Customer: months newest first, each row with its running balance. */
export const StatementList: React.FC<{ statement: Statement; onLoadMore: () => void }> = ({
  statement,
  onLoadMore,
}) => (
  <div className="mx-3 overflow-hidden rounded-[14px] border border-line bg-card">
    {statement.months.map((m) => (
      <section key={m.key} aria-label={m.label}>
        <h3 className="border-b border-line bg-card-alt px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-text-muted [section:not(:first-child)>&]:border-t">
          {m.label}
        </h3>
        <ul className="[&>li+li]:border-t [&>li+li]:border-line">
          {m.entries.map((e) => {
            const reduces = e.delta < 0;
            return (
              <li key={e.key} className="flex items-center gap-2.5 px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={`grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full border border-line bg-card-alt text-[15px] font-bold ${
                    reduces ? 'text-good' : 'text-text-high'
                  }`}
                >
                  {reduces ? '−' : '+'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text-high">{e.label}</p>
                  {e.meta && <p className="truncate text-[11px] text-text-muted">{e.meta}</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p
                    className={`num text-[13.5px] font-semibold ${reduces ? 'text-good' : 'text-text-high'}`}
                  >
                    {reduces ? '−' : '+'}
                    {inr(Math.abs(e.delta))}
                  </p>
                  <p className="num text-[11px] text-text-muted">Bal {signedRupees(e.balance)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
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
