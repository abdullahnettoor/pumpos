import { describe, expect, it } from 'vitest';
import { DAYS_OF_COVER_WINDOW } from '@pump/shared';
import { FixedClock, SequentialIdGenerator } from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import {
  GetTankDaysOfCover,
  computeTankCover,
  type TankSalesWindow,
  type TankSalesWindowQuery,
  type TankSalesWindowReader,
} from './tank-days-of-cover.js';

const ctx = {
  organizationId: 'org-1',
  stationId: 'st-1',
  actorId: 'u',
  role: 'Owner',
  clock: new FixedClock(new Date('2026-03-10T06:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
} as ExecutionContext;

function readerOf(window: TankSalesWindow) {
  const queries: TankSalesWindowQuery[] = [];
  const reader: TankSalesWindowReader = {
    read: async (q) => {
      queries.push(q);
      return window;
    },
  };
  return { reader, queries };
}

describe('computeTankCover', () => {
  it('divides stock by the average over the closed days', () => {
    // 7 closed days, 7000 L sold -> 1000 L/day; 2600 L left -> 2.6 days.
    expect(computeTankCover({ currentVolume: 2600, soldVolume: 7000, closedDays: 7 })).toEqual({
      avgDailyVolume7d: 1000,
      daysOfCover: 2.6,
    });
  });

  it('averages over the closed days found, not always 7 (new station)', () => {
    expect(computeTankCover({ currentVolume: 900, soldVolume: 3000, closedDays: 3 })).toEqual({
      avgDailyVolume7d: 1000,
      daysOfCover: 0.9,
    });
  });

  it('has no figure without a closed Business Day', () => {
    expect(computeTankCover({ currentVolume: 900, soldVolume: 0, closedDays: 0 })).toEqual({
      avgDailyVolume7d: null,
      daysOfCover: null,
    });
  });

  it('hides a tank that sold nothing in the window (average 0, no cover)', () => {
    expect(computeTankCover({ currentVolume: 900, soldVolume: 0, closedDays: 7 })).toEqual({
      avgDailyVolume7d: 0,
      daysOfCover: null,
    });
  });

  it('treats an empty tank that sells as 0 days, and never goes negative', () => {
    expect(computeTankCover({ currentVolume: 0, soldVolume: 700, closedDays: 7 }).daysOfCover).toBe(
      0,
    );
    expect(
      computeTankCover({ currentVolume: -50, soldVolume: 700, closedDays: 7 }).daysOfCover,
    ).toBe(0);
    expect(computeTankCover({ currentVolume: 500, soldVolume: -700, closedDays: 7 })).toEqual({
      avgDailyVolume7d: 0,
      daysOfCover: null,
    });
  });
});

describe('GetTankDaysOfCover', () => {
  it('reads the window once for any number of tanks and keys the result by tank', async () => {
    const { reader, queries } = readerOf({
      closedDays: 7,
      sold: [
        { tankId: 't1', volume: 7000 },
        { tankId: 't2', volume: 3500 },
      ],
    });
    const res = await new GetTankDaysOfCover({ reader }).execute(
      {
        stationId: 'st-1',
        tanks: [
          { tankId: 't1', currentVolume: 2600 },
          // Same product as t1 in a second tank: judged by its own sales.
          { tankId: 't2', currentVolume: 4000 },
          { tankId: 't3', currentVolume: 900 },
        ],
      },
      ctx,
    );
    expect(queries).toEqual([
      { organizationId: 'org-1', stationId: 'st-1', days: DAYS_OF_COVER_WINDOW },
    ]);
    expect(res.success && res.data).toEqual({
      t1: { avgDailyVolume7d: 1000, daysOfCover: 2.6 },
      t2: { avgDailyVolume7d: 500, daysOfCover: 8 },
      t3: { avgDailyVolume7d: 0, daysOfCover: null },
    });
  });

  it('skips the read for a station with no tanks', async () => {
    const { reader, queries } = readerOf({ closedDays: 7, sold: [] });
    const res = await new GetTankDaysOfCover({ reader }).execute(
      { stationId: 'st-1', tanks: [] },
      ctx,
    );
    expect(queries).toHaveLength(0);
    expect(res.success && res.data).toEqual({});
  });

  it('gives every tank no figure when the station has no closed day', async () => {
    const { reader } = readerOf({ closedDays: 0, sold: [] });
    const res = await new GetTankDaysOfCover({ reader }).execute(
      { stationId: 'st-1', tanks: [{ tankId: 't1', currentVolume: 100 }] },
      ctx,
    );
    expect(res.success && res.data.t1).toEqual({ avgDailyVolume7d: null, daysOfCover: null });
  });

  it('refuses an invalid query', async () => {
    const { reader, queries } = readerOf({ closedDays: 7, sold: [] });
    const res = await new GetTankDaysOfCover({ reader }).execute({ stationId: '', tanks: [] }, ctx);
    expect(res.success).toBe(false);
    expect(queries).toHaveLength(0);
  });
});
