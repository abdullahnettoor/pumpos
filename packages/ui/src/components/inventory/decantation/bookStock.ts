import { DEFAULT_TANK_LEVEL_SETTINGS, deriveTankLevel } from '@pump/shared';
import { stockOfCapacity } from '../../../pump-ds/tank-gauge/stockOfCapacity.js';
import type { TankOption } from './stepShared.js';

/**
 * A tank's book stock as the tank cards read it (#603):
 * `Book 13,000 L of 20,000 L · 65%`, `Book 1,240 kg` without a capacity.
 */
export function bookStock(tank: TankOption): string | undefined {
  if (tank.currentVolume == null) return undefined;
  // The shared tank-level model's percent, so the step and the cards agree.
  const { pct } = deriveTankLevel(
    { capacity: tank.capacity ?? 0, currentVolume: tank.currentVolume },
    DEFAULT_TANK_LEVEL_SETTINGS,
  );
  const f = stockOfCapacity(tank.currentVolume, tank.capacity, tank.unit, pct);
  return `Book ${f.stock}${f.detail ? ` ${f.detail}` : ''}`;
}
