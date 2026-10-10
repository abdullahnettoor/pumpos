import React from 'react';
import { inr } from '@pump/ui';

export interface HandoverSummary {
  expectedTotal: number;
  declaredTotal: number;
  varianceAmount: number;
}

/** Variance tone: balanced is good, short is bad, over is a warning. */
export const varianceTone = (variance: number) =>
  Math.abs(variance) < 1 ? 'text-good' : variance < 0 ? 'text-bad-fg' : 'text-warn-fg';

export const formatVariance = (variance: number) => `${variance >= 0 ? '+' : ''}${inr(variance)}`;

const Cell: React.FC<{ label: string; value: string; tone?: string; first?: boolean }> = ({
  label,
  value,
  tone = 'text-text-high',
  first,
}) => (
  <div className={first ? 'min-w-0' : 'min-w-0 border-l border-line pl-2.5'}>
    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-faint">{label}</p>
    <p className={`num mt-0.5 truncate text-[15px] font-semibold ${tone}`}>{value}</p>
  </div>
);

/**
 * Expected · Declared · Variance, pinned to the top while the steps scroll
 * beneath it. Shows the live preview as the attendant types, and the server's
 * accepted figures once a save lands.
 */
export const SummaryStrip: React.FC<{
  summary: HandoverSummary;
  accepted: boolean;
  /** Where this handover is, e.g. "Highway Fuels · Shift 2". */
  context?: string;
}> = ({ summary, accepted, context }) => (
  <div
    role="group"
    aria-label="Handover summary"
    // The ::before block hides steps scrolling through the padding above the
    // strip once it sticks.
    className="sticky top-0 z-10 rounded-2xl border border-line bg-card px-3 py-2.5 shadow-chip before:absolute before:inset-x-[-1px] before:-top-[17px] before:h-4 before:bg-background before:content-['']"
  >
    <div className="grid grid-cols-3 gap-2.5">
      <Cell first label="Expected" value={inr(summary.expectedTotal)} />
      <Cell label="Declared" value={inr(summary.declaredTotal)} />
      <Cell
        label="Variance"
        value={formatVariance(summary.varianceAmount)}
        tone={varianceTone(summary.varianceAmount)}
      />
    </div>
    <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold">
      <span className={`uppercase tracking-wide ${accepted ? 'text-good' : 'text-text-faint'}`}>
        {accepted ? 'Accepted by server' : 'Live preview'}
      </span>
      {context ? <span className="truncate text-text-muted">{context}</span> : null}
    </div>
  </div>
);
