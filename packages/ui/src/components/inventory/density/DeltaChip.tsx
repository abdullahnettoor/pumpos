import React from 'react';
import { Chip, DENSITY_FLAG } from '../../../pump-ds/index.js';
import { formatDensity } from '../../../utils/format.js';
import {
  isUnexplainedDensityJump,
  type DensityReadingKind,
  type DensityReadingWithContext,
} from '@pump/shared';
import { DENSITY_KIND_TONE } from './densityKind.js';

export interface DeltaChipProps {
  delta: number | null | undefined;
  kind: DensityReadingKind;
  flags: DensityReadingWithContext['flags'];
  /** The station's tolerance (`resolveDecantationSettings`); no default here. */
  tolerance: number;
}

/**
 * Change vs the previous reading, in the shared density format (#521):
 * `+0.6`, or `+5.2 · Unexplained jump` in danger. A Decantation beyond
 * tolerance is a new load, shown in the Decantation tone.
 */
export const DeltaChip: React.FC<DeltaChipProps> = ({ delta, kind, flags, tolerance }) => {
  if (delta == null) {
    return <span className="text-ink-faint">—</span>;
  }

  const shown = formatDensity(delta, { plus: true });
  const isUnexplained = isUnexplainedDensityJump({ delta, kind, flags, tolerance });
  const isNewLoad = kind === 'DECANTATION' && Math.abs(delta) > tolerance;
  const tone = isUnexplained
    ? DENSITY_FLAG.jump.tone
    : isNewLoad
      ? DENSITY_KIND_TONE.DECANTATION
      : 'neutral';

  return (
    <Chip tone={tone} size="sm" className="tabular-nums">
      {isUnexplained ? `${shown} · ${DENSITY_FLAG.jump.label}` : shown}
    </Chip>
  );
};
