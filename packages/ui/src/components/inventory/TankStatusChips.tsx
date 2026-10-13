import React from 'react';
import { Chip } from '../../pump-ds/index.js';
import { TANK_TONE_LABEL, type TankLevelSettings } from '@pump/shared';
import { classifyTank, tankPct } from '../../utils/stock.js';

export interface TankStatusChipsProps {
  tank: {
    capacity: number | string;
    currentVolume: number | string;
    waitingOnDecantation?: boolean;
  };
  /** The station's tank levels (`useTankLevelSettings`). */
  tankLevels: TankLevelSettings;
}

/** Keeps the normal stock state visible alongside a pending Decantation state. */
export const TankStatusChips: React.FC<TankStatusChipsProps> = ({ tank, tankLevels }) => {
  const capacity = Number(tank.capacity) || 0;
  const volume = Number(tank.currentVolume) || 0;
  const level = classifyTank(tankPct(volume, capacity), tankLevels);
  const tone =
    level === 'critical'
      ? 'danger'
      : level === 'low'
        ? 'warning'
        : level === 'over'
          ? 'info'
          : 'success';
  const label =
    level === 'critical' || level === 'low'
      ? TANK_TONE_LABEL[level]
      : level === 'over'
        ? 'Over capacity'
        : 'OK';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px' }}>
      <Chip tone={tone} size="xs">
        {label}
      </Chip>
      {tank.waitingOnDecantation && (
        <Chip tone="warning" size="xs">
          Waiting on decantation
        </Chip>
      )}
    </div>
  );
};
