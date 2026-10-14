import React from 'react';
import { Chip, DENSITY_FLAG, formatDensityDelta } from '../../../pump-ds/index.js';
import { isUnexplainedDensityJump } from '@pump/shared';

export interface DeltaChipProps {
  delta: number | null | undefined;
  kind?: string;
  flags?: unknown[];
  /** The station's tolerance (`resolveDecantationSettings`); no default here. */
  tolerance: number;
}

/**
 * Change vs the previous reading, in the shared density format (#521):
 * `+0.6`, or `+5.2 · Unexplained jump` in danger. A Decantation beyond
 * tolerance is a new load, shown in info.
 */
export const DeltaChip: React.FC<DeltaChipProps> = ({ delta, kind, flags, tolerance }) => {
  if (delta == null) {
    return <span className="text-ink-faint">—</span>;
  }

  const isUnexplained = isUnexplainedDensityJump({ delta, kind, flags, tolerance });
  const isNewLoad = kind === 'DECANTATION' && Math.abs(delta) > tolerance;
  const tone = isUnexplained ? DENSITY_FLAG.jump.tone : isNewLoad ? 'info' : 'neutral';
  const text = isUnexplained
    ? `${formatDensityDelta(delta)} · ${DENSITY_FLAG.jump.label}`
    : formatDensityDelta(delta);

  return (
    <Chip tone={tone} size="sm" className="tabular-nums">
      {text}
    </Chip>
  );
};
