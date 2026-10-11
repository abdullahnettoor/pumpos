import React from 'react';
import { Chip } from '../../../pump-ds/index.js';
import { DEFAULT_DENSITY_TOLERANCE_KG_M3, isUnexplainedDensityJump } from '@pump/shared';

export interface DeltaChipProps {
  delta: number | null | undefined;
  kind?: string;
  flags?: unknown[];
  tolerance?: number;
}

export const DeltaChip: React.FC<DeltaChipProps> = ({
  delta,
  kind,
  flags,
  tolerance = DEFAULT_DENSITY_TOLERANCE_KG_M3,
}) => {
  if (delta == null) {
    return <span className="opacity-50">—</span>;
  }

  const isDecantation = kind === 'DECANTATION';
  const isLargeJump = Math.abs(delta) > tolerance;
  const isUnexplained = isUnexplainedDensityJump({ delta, kind, flags, tolerance });

  const tone = isUnexplained ? 'danger' : isDecantation && isLargeJump ? 'info' : 'neutral';

  const sign = delta > 0 ? '+' : '';
  const text = `${sign}${delta.toFixed(2)}`;

  return (
    <Chip tone={tone} size="sm">
      {text}
      {isUnexplained ? ' · jump' : ''}
    </Chip>
  );
};
