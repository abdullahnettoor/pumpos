import React from 'react';
import type { NozzleLine } from '../../lib/shifts/summary.js';

/** Meter readings keep up to three decimals (as the PDF does), without trailing zeros. */
const reading = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });

const COLS = 'grid grid-cols-[1.1fr_1fr_1fr_0.9fr] items-baseline gap-1 px-3';

/** Opening and closing meter readings and the litres sold, per nozzle. */
export const NozzleTable: React.FC<{ nozzles: readonly NozzleLine[] }> = ({ nozzles }) => (
  <div className="mx-3 overflow-hidden rounded-[14px] border border-line bg-card">
    <div
      className={`${COLS} py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-text-faint [&>:not(:first-child)]:text-right`}
    >
      <span>Nozzle</span>
      <span>Opening</span>
      <span>Closing</span>
      <span>Litres</span>
    </div>
    {nozzles.length === 0 && (
      <p className="border-t border-line px-3 py-2.5 text-xs text-text-muted">
        No nozzle readings in this summary.
      </p>
    )}
    {nozzles.map((n) => (
      <div
        key={n.key}
        className={`${COLS} border-t border-line py-2.5 text-xs [&>:not(:first-child)]:text-right`}
      >
        <span className="min-w-0">
          <b className="block text-[13px] text-text-high">{n.nozzle}</b>
          {n.detail && (
            <span className="block truncate text-[10px] text-text-muted">{n.detail}</span>
          )}
        </span>
        <span className="num text-text-muted">{reading(n.opening)}</span>
        <span className="num text-text-muted">{reading(n.closing)}</span>
        <span className="num font-semibold text-text-high">
          {reading(n.litres)}
          {n.testing > 0 && (
            <span className="block text-[10px] font-normal text-text-muted">
              −{reading(n.testing)} test
            </span>
          )}
        </span>
      </div>
    ))}
  </div>
);
