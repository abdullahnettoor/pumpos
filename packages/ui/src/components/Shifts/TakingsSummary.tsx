import React from 'react';
import { Panel, StatusChip } from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import type { NozzleGroup, Takings } from './liveShiftModel.js';

export interface TakingsSummaryProps {
  takings: Takings;
  recorded: number;
  expected: number;
  pending: NozzleGroup[];
  /**
   * A Handover is saving or its figures are not confirmed yet (#606): cash
   * sales and the total are not in its answer, so they read "Saving…".
   */
  confirming?: boolean;
}

const Line: React.FC<{ label: string; value: number | null; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className={strong ? 'font-semibold text-ink-strong' : 'text-ink-muted'}>{label}</dt>
    <dd
      className={
        strong
          ? 'font-mono font-semibold tabular-nums text-ink-strong'
          : 'font-mono tabular-nums text-ink-default'
      }
    >
      {value == null ? <StatusChip status="saving" size="sm" /> : formatMoney(value)}
    </dd>
  </div>
);

/**
 * Live shift → Takings (#533): what the shift has taken so far, by how it was
 * paid. Cash is the Drawers' declared cash sales (floats excluded), card, UPI
 * and credit as declared at Handover. Ordinary money, so no colour.
 */
export const TakingsSummary: React.FC<TakingsSummaryProps> = ({
  takings,
  recorded,
  expected,
  pending,
  confirming = false,
}) => (
  <Panel title="Takings · this shift">
    <dl className="flex flex-col gap-1.5 text-[13px]">
      <Line label="Cash sales" value={confirming ? null : takings.cash} />
      <Line label="Card" value={takings.card} />
      <Line label="UPI" value={takings.upi} />
      <Line label="Credit" value={takings.credit} />
      <div className="mt-1 border-t border-border-soft pt-1.5">
        <Line label="Total taken" value={confirming ? null : takings.total} strong />
      </div>
    </dl>
    <p className="mt-2 text-[12px] text-ink-muted">
      {recorded === 0
        ? 'Card, UPI and credit from the shift’s entries until a handover is recorded.'
        : pending.length > 0
          ? `From ${recorded} of ${expected} handovers · ${pending
              .map((g) => g.du)
              .join(', ')} pending`
          : `From all ${expected} handovers`}
    </p>
  </Panel>
);
