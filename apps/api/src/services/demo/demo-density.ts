import { RecordDensityReading } from '@pump/core';
import { density15FromObserved, resolveDecantationSettings, roundDensity, vcf } from '@pump/shared';
import { DrizzleDensityReadingRepository } from '../../infra/repositories/decantation-repositories.js';
import { must, type DemoContext } from './demo-context.js';

/** Density register helpers: hydrometer samples and Morning / Ad-hoc readings. */
export function createDensityHelpers(ctx: DemoContext) {
  const { tx, events, ids, stationId, managerId, context } = ctx;
  const decantationSettings = resolveDecantationSettings(ctx.stationSettings);
  const iso = (date: Date) => date.toISOString();

  const hydrometer = (density15: number, tempC: number) => ({
    observedDensity: Math.round(density15 * vcf(density15, tempC) * 2) / 2,
    observedTempC: tempC,
  });
  const standardDensity = (reading: { observedDensity: number; observedTempC: number }) =>
    roundDensity(
      density15FromObserved(reading.observedDensity, reading.observedTempC, {
        method: decantationSettings.densityMethod,
      }),
      2,
    );

  /** A product's density reading (Morning or Ad-hoc) from a hydrometer sample. */
  const recordDensity = async (input: {
    productId: string;
    date: string;
    at: Date;
    kind: 'MORNING' | 'ADHOC';
    density15: number;
    tempC: number;
    tankId?: string;
  }) =>
    must(
      await new RecordDensityReading({
        densityReadings: new DrizzleDensityReadingRepository(tx),
        events,
        ids: { generate: () => ids.newId() },
        settings: {
          densityToleranceKgM3: decantationSettings.densityToleranceKgM3,
          densityMethod: decantationSettings.densityMethod,
        },
      }).execute(
        {
          stationId,
          productId: input.productId,
          businessDate: input.date,
          kind: input.kind,
          sampledFrom: 'TANK',
          tankId: input.tankId ?? null,
          entryMethod: 'HYDROMETER',
          ...hydrometer(input.density15, input.tempC),
          recordedAt: iso(input.at),
        },
        context(input.at, managerId),
      ),
      'density reading',
    );

  return { hydrometer, standardDensity, recordDensity };
}

export type DensityHelpers = ReturnType<typeof createDensityHelpers>;
