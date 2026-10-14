import React from 'react';
import { Chip, ConceptIcon, Icon } from '../pump-ds/index.js';
import { cn } from '../pump-ds/lib/cn.js';
import { formatBusinessDate, formatMoney, inr } from '../utils/format.js';
import { OFFICE_RECORD_KINDS, type OfficeRecordKind } from './kinds.js';
import type { OfficeRecordPreview, PreviewMove } from './preview.js';

export interface PreviewViewProps {
  kind: OfficeRecordKind;
  preview: OfficeRecordPreview;
  what: string | null;
  amount: number | null;
  date: string;
  dateLabel: string;
  footnote: string;
}

const CHECK_TONE = {
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  info: 'text-info-fg',
} as const;

/** Before → after. The strip shows whole rupees to fit; the full preview shows paise. */
const Move: React.FC<{ move: PreviewMove; compact?: boolean }> = ({ move, compact }) => {
  const fmt = (n: number) => (compact ? formatMoney(n, { decimals: 0 }) : inr(n));
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11.5px] tabular-nums">
      <span className="text-ink-muted">{fmt(move.before)}</span>
      <Icon name="arrow-right" size="xs" />
      <span className={move.after < 0 ? 'text-danger-fg' : 'text-ink-strong'}>
        {fmt(move.after)}
      </span>
    </span>
  );
};

const FlagChip: React.FC<{ flag: OfficeRecordPreview['flag'] }> = ({ flag }) => (
  <Chip
    tone={flag.tone}
    size="sm"
    icon={<Icon name={flag.tone === 'success' ? 'check' : 'warning'} size="xs" />}
  >
    {flag.label}
  </Chip>
);

const Card: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-3 rounded-card border border-border-soft bg-surface px-3.5 py-3">
    {title && (
      <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h4>
    )}
    {children}
  </section>
);

/** The full preview: what is recorded, the balances that move, the ledger lines and checks. */
export const PreviewCards: React.FC<PreviewViewProps> = ({
  kind,
  preview,
  what,
  amount,
  date,
  dateLabel,
  footnote,
}) => {
  const def = OFFICE_RECORD_KINDS[kind];
  return (
    <div>
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-brand">
            <ConceptIcon concept={def.concept} size="sm" />
          </span>
          <span className="font-semibold text-ink-strong">{def.label}</span>
          <span className="ml-auto">
            <Chip tone="neutral" variant="outline" size="xs">
              {dateLabel} {date ? formatBusinessDate(date) : '—'}
            </Chip>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[13px] text-ink-muted">{what ?? `${def.label}?`}</span>
          <span className="font-mono text-[20px] font-semibold tabular-nums text-ink-strong">
            {amount ? inr(amount) : '₹—'}
          </span>
        </div>
      </Card>
      <Card title="Balances">
        {preview.moves.length === 0 ? (
          <p className="text-[12px] text-ink-faint">
            Choose the account and the party to see balances move.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {preview.moves.map((m) => (
              <li
                key={m.label}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12.5px]"
              >
                <span className="text-ink-default">{m.label}</span>
                <Move move={m} />
              </li>
            ))}
          </ul>
        )}
        {preview.lines.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-border-soft pt-2">
            {preview.lines.map((l) => (
              <li key={l.label} className="flex justify-between gap-3 text-[12.5px]">
                <span className="text-ink-muted">{l.label}</span>
                <span className="font-mono tabular-nums">
                  {l.amount == null ? '' : inr(l.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Checks">
        {preview.checks.length === 0 ? (
          <p className="flex items-center gap-2 text-[12px] text-success-fg">
            <Icon name="check" size="xs" />
            Nothing unusual.
          </p>
        ) : (
          <ul className="flex flex-col">
            {preview.checks.map((c) => (
              <li
                key={c.code}
                className={cn(
                  'flex gap-2 border-t border-border-soft py-1.5 text-[12px] first:border-t-0',
                  CHECK_TONE[c.tone],
                )}
              >
                <span className="mt-0.5 shrink-0">
                  <Icon name={c.tone === 'info' ? 'info' : 'warning'} size="xs" />
                </span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-[11.5px] text-ink-faint">{footnote}</p>
    </div>
  );
};

/**
 * The compact preview above the footer: what is recorded, the main balance
 * change, a warning chip and the amount. Click to expand the full preview.
 */
export const PreviewStrip: React.FC<
  PreviewViewProps & { expanded: boolean; onToggle: () => void }
> = ({ expanded, onToggle, ...props }) => {
  const { kind, preview, what, amount } = props;
  const def = OFFICE_RECORD_KINDS[kind];
  const move = preview.mainMove;
  return (
    <div className="shrink-0 border-t border-border-soft bg-surface-alt">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label="Preview"
        className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left hover:bg-brand/5"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-input border border-border-soft bg-surface text-brand">
          <ConceptIcon concept={def.concept} size="sm" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px text-[12.5px]">
          <span className="truncate font-semibold text-ink-strong">{what ?? def.label}</span>
          {move ? (
            <span className="flex min-w-0 items-center gap-1.5 text-ink-muted">
              <span className="min-w-[4rem] truncate text-[11.5px]">{move.label}</span>
              <Move move={move} compact />
            </span>
          ) : (
            <span className="truncate text-[11.5px] text-ink-faint">
              Choose the account to see its balance move
            </span>
          )}
        </span>
        <FlagChip flag={preview.flag} />
        <span className="font-mono text-[15px] font-semibold tabular-nums text-ink-strong">
          {amount ? inr(amount) : '₹—'}
        </span>
        <span className={cn('text-ink-muted transition-transform', expanded && 'rotate-180')}>
          <Icon name="chevron-down" size="sm" />
        </span>
      </button>
      {expanded && (
        <div className="max-h-[46vh] overflow-y-auto px-5 pb-3">
          <PreviewCards {...props} />
        </div>
      )}
    </div>
  );
};
