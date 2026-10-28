import React from 'react';
import type { TankStatusState } from '@pump/shared';
import { StatusChip } from '../../pump-ds/index.js';

export interface TankStatusChipsProps {
  /** `tankStates(level)`: the tank level's word, then over capacity, then a pending Decantation. */
  states: readonly TankStatusState[];
  className?: string;
}

/**
 * A tank's states as status chips (#518, #536): Critical / Low from the tank
 * level (the gauge's own words and tones), Over capacity, Waiting on
 * decantation. An ordinary tank has none, so nothing renders.
 */
export const TankStatusChips: React.FC<TankStatusChipsProps> = ({ states, className }) =>
  states.length === 0 ? null : (
    <div className={className ?? 'flex flex-wrap gap-1'}>
      {states.map((s) => (
        <StatusChip key={s} status={s} size="md" />
      ))}
    </div>
  );
