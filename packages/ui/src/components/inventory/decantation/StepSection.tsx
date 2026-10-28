import React from 'react';
import { Icon } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import { lineSwatch } from './stepShared.js';

export interface StepSectionProps {
  n: number;
  title: string;
  open: boolean;
  done: boolean;
  /** Compact card of the recorded values, shown once the step is finished and collapsed. */
  summary: React.ReactNode;
  onOpen: () => void;
  /** Sealed-day record: shown as a card only, never opened for edit. */
  readOnly?: boolean;
  children: React.ReactNode;
}

/** Step number badge: finished (collapsed) → success, open → brand fill, else quiet. */
const BADGE = {
  done: 'bg-success-bg text-success-fg',
  open: 'bg-brand text-on-brand',
  idle: 'bg-surface-alt text-ink-muted',
} as const;

/**
 * One step of the Decantation stepper (accordion). A finished step collapses into a
 * compact card of its recorded values; clicking the header opens it again to edit.
 */
export const StepSection: React.FC<StepSectionProps> = ({
  n,
  title,
  open,
  done,
  summary,
  onOpen,
  readOnly = false,
  children,
}) => {
  const collapsedDone = done && !open;
  return (
    <section
      aria-label={title}
      className={cn(
        'mb-2.5 overflow-hidden rounded-input border bg-surface',
        open ? 'border-brand' : 'border-border-soft',
      )}
    >
      {/* Full-width accordion header, not an action button: stays a native button. */}
      <button
        type="button"
        onClick={readOnly ? undefined : onOpen}
        aria-expanded={open}
        disabled={readOnly}
        className={cn(
          'flex w-full items-center gap-2.5 border-0 px-3 py-2.5 text-left text-ink',
          open ? 'bg-surface-alt' : 'bg-transparent',
          readOnly ? 'cursor-default' : 'cursor-pointer',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-[22px] shrink-0 place-items-center rounded-full text-[12px] font-semibold',
            BADGE[collapsedDone ? 'done' : open ? 'open' : 'idle'],
          )}
        >
          {collapsedDone ? <Icon name="check" size="xs" /> : n}
        </span>
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="flex-1" />
        {collapsedDone && (
          <span className="text-[12px] text-ink-muted">{readOnly ? 'Sealed' : 'Edit'}</span>
        )}
      </button>
      {open ? (
        <div className="px-3 pb-3 pt-1">{children}</div>
      ) : done ? (
        <div
          className={cn('pb-2.5 pl-11 pr-3 pt-0.5', readOnly ? 'cursor-default' : 'cursor-pointer')}
          onClick={readOnly ? undefined : onOpen}
        >
          {summary}
        </div>
      ) : null}
    </section>
  );
};

/** Compact label/value pairs for the finished-step cards. */
export const KV: React.FC<{ items: [string, React.ReactNode][] }> = ({ items }) => (
  <div className="flex flex-wrap gap-[18px] text-[12px]">
    {items.map(([k, v]) => (
      <div key={k} className="flex flex-col gap-px">
        <span className="text-[12px] text-ink-muted">{k}</span>
        <span className="font-semibold tabular-nums">{v}</span>
      </div>
    ))}
  </div>
);

export const LineTag: React.FC<{ i: number; label: string }> = ({ i, label }) => (
  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
    <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', lineSwatch(i))} />
    {label}
  </span>
);

const NOTICE_TONE = {
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg',
  warning: 'bg-warning-bg text-warning-fg',
} as const;

export const Notice: React.FC<{
  tone: keyof typeof NOTICE_TONE;
  children: React.ReactNode;
}> = ({ tone, children }) => (
  <div
    role="note"
    className={cn('my-1.5 rounded-input px-2.5 py-1.5 text-[12px]', NOTICE_TONE[tone])}
  >
    {children}
  </div>
);
