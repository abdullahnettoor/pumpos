import React from 'react';
import type { CashVariance } from '../lib/cashVariance.js';
import { StatTileShell } from '../ui/index.js';
import { TONE_FILL, TONE_TEXT } from '../ui/tones.js';

/**
 * The cash variance, wherever it appears (Home, DSSR, Shift Summary): both levels
 * of ADR 0005 as two labelled figures of equal weight, never summed. The dot
 * beside the title is red only above `VARIANCE_ALERT`, amber for a smaller variance;
 * each figure carries its own tone.
 * Lay out in the caller's two-column grid; `wide` spans both columns and sets the
 * levels side by side.
 */
export const CashVarianceCard: React.FC<{ variance: CashVariance; wide?: boolean }> = ({
  variance: v,
  wide,
}) => (
  <StatTileShell role="group" aria-label="Cash variance" wide={wide}>
    <p className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
      {v.levels.length > 0 && (
        <span
          aria-hidden="true"
          data-tone={v.tone}
          className={`h-1.5 w-1.5 rounded-full ${TONE_FILL[v.tone]}`}
        />
      )}
      Cash variance
    </p>
    {v.levels.length === 0 ? (
      <>
        <p className="num mt-1 text-xl font-semibold text-text-high">—</p>
        {v.empty && <p className="mt-0.5 text-[11px] text-text-muted">{v.empty}</p>}
      </>
    ) : (
      <div className={`mt-1.5 grid gap-2 ${wide ? 'grid-cols-2 gap-x-4' : ''}`}>
        {v.levels.map((l) => (
          <div key={l.key} data-variance-level={l.key}>
            <dl>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[11px] font-medium text-text-muted">{l.label}</dt>
                <dd className={`num text-base font-semibold ${TONE_TEXT[l.tone]}`}>{l.text}</dd>
              </div>
            </dl>
            <p className="text-[11px] text-text-faint">{l.note}</p>
          </div>
        ))}
      </div>
    )}
  </StatTileShell>
);
