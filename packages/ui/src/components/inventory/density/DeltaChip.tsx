import React from 'react';
import { Chip, DENSITY_FLAG } from '../../../pump-ds/index.js';
import { formatDensity } from '../../../utils/format.js';
import {
  densityChangeExceedsTolerance,
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
  /**
   * Names what the change is measured against (`vs prev`) where no column
   * header does, so it is not read as the reading's change vs yesterday.
   */
  baseline?: string;
}

/**
 * Change vs the previous reading, in the shared density format (#521):
 * `+0.6`, or `+5.2 · Unexplained jump` in danger. A Decantation beyond
 * tolerance is a new load, shown in the Decantation tone. The jump rule is
 * `densityChangeExceedsTolerance`, the same one the reading uses.
 */
export const DeltaChip: React.FC<DeltaChipProps> = ({
  delta,
  kind,
  flags,
  tolerance,
  baseline,
}) => {
  if (delta == null) {
    return <span className="text-ink-faint">—</span>;
  }

  const shown = [formatDensity(delta, { plus: true }), baseline].filter(Boolean).join(' ');
  const isUnexplained = isUnexplainedDensityJump({ delta, kind, flags, tolerance });
  const isNewLoad =
    !isUnexplained && kind === 'DECANTATION' && densityChangeExceedsTolerance(delta, tolerance);
  const tone = isUnexplained
    ? DENSITY_FLAG.jump.tone
    : isNewLoad
      ? DENSITY_KIND_TONE.DECANTATION
      : 'neutral';

  return (
    <Chip tone={tone} size="md" className="tabular-nums">
      {isUnexplained ? `${shown} · ${DENSITY_FLAG.jump.label}` : shown}
    </Chip>
  );
};
