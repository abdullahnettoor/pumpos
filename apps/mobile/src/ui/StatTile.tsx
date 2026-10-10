import React from 'react';
import { TONE_TEXT, type Tone } from './tones.js';

interface Props {
  label: string;
  /** Amount, quantity or count: set in the tabular mono face. */
  value: string;
  sub?: React.ReactNode;
  /** A further line under `sub`. */
  note?: string;
  tone?: Tone;
  /** Span both columns of a two-column grid, with a larger figure. */
  wide?: boolean;
  /** Right-hand slot of a wide tile (a sparkline). */
  trailing?: React.ReactNode;
}

/**
 * A labelled figure in a card; lay out in `<div className="grid grid-cols-2 gap-2 px-3">`.
 * Not the design system's `KpiTile`: that is a featureless cell framed by a `KpiStrip`
 * (caps label, no wide variant or trailing sparkline); the mobile grid is separate bordered cards.
 */
export const StatTile: React.FC<Props> = ({
  label,
  value,
  sub,
  note,
  tone = 'default',
  wide,
  trailing,
}) => (
  <div
    className={`rounded-[14px] border border-line bg-card p-3 ${
      wide ? 'col-span-2 flex items-end justify-between gap-3' : ''
    }`}
  >
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-text-muted">{label}</p>
      <p
        className={`num mt-1 font-semibold ${wide ? 'text-[30px] tracking-[-0.03em]' : 'text-xl'} ${TONE_TEXT[tone]}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
      {note && <p className="text-[11px] text-text-faint">{note}</p>}
    </div>
    {trailing}
  </div>
);
