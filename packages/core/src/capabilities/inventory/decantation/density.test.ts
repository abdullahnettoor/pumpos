import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DENSITY_TOLERANCE_KG_M3,
  density15FromObserved,
  roundDensity,
} from '@pump/shared';
import { BusinessEvents, FixedClock, SequentialIdGenerator, type ExecutionContext } from '../../../kernel/index.js';
import type {
  DensityReading,
  DensityReadingListQuery,
  DensityReadingRepository,
  DensityReadingWithContext,
  DensityTodaySummary,
} from './ports.js';
import {
  RecordDensityReading,
  type RecordDensityReadingDeps,
} from './record-density-reading.js';
import { ListDensityReadings } from './list-density-readings.js';
import { GetDensityTodaySummary } from './get-density-today-summary.js';

class InMemoryDensityRepo implements DensityReadingRepository {
  readings: DensityReading[] = [];
  interveningDecantation = false;

  async saveMany(items: DensityReading[]): Promise<void> {
    this.readings.push(...items);
  }

  async findLatestForProduct(
    organizationId: string,
    stationId: string,
    productId: string,
    beforeRecordedAt?: string,
  ): Promise<DensityReading | null> {
    const matching = this.readings.filter(
      (r) =>
        r.organizationId === organizationId &&
        r.stationId === stationId &&
        r.productId === productId &&
        (!beforeRecordedAt || r.recordedAt < beforeRecordedAt),
    );
    if (!matching.length) return null;
    matching.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return matching[0];
  }

  async hasInterveningDecantation(
    _orgId: string,
    _stationId: string,
    _productId: string,
    _after: string,
    _before: string,
  ): Promise<boolean> {
    return this.interveningDecantation;
  }

  async list(query: DensityReadingListQuery): Promise<DensityReadingWithContext[]> {
    return this.readings
      .filter((r) => r.organizationId === query.organizationId && r.stationId === query.stationId)
      .map((r) => ({ ...r, productName: 'Motor Spirit', productCode: 'MS' }));
  }

  async getTodaySummary(
    _orgId: string,
    _stationId: string,
    businessDate: string,
  ): Promise<DensityTodaySummary> {
    return {
      businessDate,
      products: [],
      recordedCount: 0,
      missingCount: 0,
      totalProducts: 0,
    };
  }
}

const baseCtx: ExecutionContext = {
  organizationId: 'org-1',
  stationId: 'st-1',
  actorId: 'usr-1',
  userId: 'usr-1',
  timeZone: 'Asia/Kolkata',
  businessDayStartsAt: '06:00',
  clock: new FixedClock(new Date('2026-10-11T08:00:00Z')),
  ids: new SequentialIdGenerator('evt'),
};

describe('RecordDensityReading', () => {
  it('computes 15 °C density server-side for HYDROMETER entry', async () => {
    const repo = new InMemoryDensityRepo();
    const publish = vi.fn().mockResolvedValue(undefined);
    const useCase = new RecordDensityReading({
      densityReadings: repo,
      events: { publish },
      ids: { generate: () => 'reading-1' },
    });

    const res = await useCase.execute(
      {
        stationId: 'st-1',
        productId: 'prod-ms',
        kind: 'MORNING',
        entryMethod: 'HYDROMETER',
        observedDensity: 745.0,
        observedTempC: 28.5,
        sampledFrom: 'NOZZLE',
        nozzleId: 'noz-1',
      },
      baseCtx,
    );

    expect(res.success).toBe(true);
    if (!res.success) return;

    const reading = res.data;
    expect(reading.id).toBe('reading-1');
    expect(reading.entryMethod).toBe('HYDROMETER');
    expect(reading.observedDensity).toBe(745.0);
    expect(reading.observedTempC).toBe(28.5);

    const expected15 = roundDensity(
      density15FromObserved(745.0, 28.5, { tolerance: DEFAULT_DENSITY_TOLERANCE_KG_M3 }),
      2,
    );
    expect(reading.density15).toBe(expected15);
    expect(reading.flags).toEqual([]);
    expect(repo.readings).toHaveLength(1);

    expect(publish).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: BusinessEvents.DENSITY_RECORDED,
        payload: expect.objectContaining({
          readingId: 'reading-1',
          density15: expected15,
          isUnexplainedJump: false,
        }),
      }),
    ]);
  });

  it('records DIRECT_15 entry without hydrometer fields', async () => {
    const repo = new InMemoryDensityRepo();
    const publish = vi.fn().mockResolvedValue(undefined);
    const useCase = new RecordDensityReading({
      densityReadings: repo,
      events: { publish },
      ids: { generate: () => 'reading-2' },
    });

    const res = await useCase.execute(
      {
        stationId: 'st-1',
        productId: 'prod-hsd',
        kind: 'ADHOC',
        entryMethod: 'DIRECT_15',
        density15: 832.4,
        sampledFrom: 'TANK',
        tankId: 'tank-diesel-1',
      },
      baseCtx,
    );

    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.density15).toBe(832.4);
    expect(res.data.observedDensity).toBeNull();
    expect(res.data.observedTempC).toBeNull();
  });

  it('flags UNEXPLAINED_JUMP when Δ vs previous exceeds tolerance with no decantation', async () => {
    const repo = new InMemoryDensityRepo();
    // Prior reading yesterday
    repo.readings.push({
      id: 'prev-reading',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-10-10',
      productId: 'prod-ms',
      kind: 'MORNING',
      sampledFrom: null,
      tankId: null,
      nozzleId: null,
      entryMethod: 'DIRECT_15',
      observedDensity: null,
      observedTempC: null,
      density15: 740.0,
      decantationTankLineId: null,
      flags: [],
      recordedBy: 'usr-1',
      recordedAt: '2026-10-10T06:30:00.000Z',
    });

    const publish = vi.fn().mockResolvedValue(undefined);
    const useCase = new RecordDensityReading({
      densityReadings: repo,
      events: { publish },
      settings: { densityToleranceKgM3: 3.0 },
    });

    // New reading with jump of 6.0 kg/m³ (> 3.0)
    const res = await useCase.execute(
      {
        stationId: 'st-1',
        productId: 'prod-ms',
        kind: 'MORNING',
        entryMethod: 'DIRECT_15',
        density15: 746.0,
        recordedAt: '2026-10-11T06:30:00.000Z',
      },
      baseCtx,
    );

    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.flags).toContain('UNEXPLAINED_JUMP');
    expect(publish).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: BusinessEvents.DENSITY_RECORDED,
        payload: expect.objectContaining({
          isUnexplainedJump: true,
          deltaVsPrevious: 6.0,
        }),
      }),
    ]);
  });

  it('does NOT flag UNEXPLAINED_JUMP if prior reading was a DECANTATION', async () => {
    const repo = new InMemoryDensityRepo();
    repo.readings.push({
      id: 'prev-decant-reading',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-10-10',
      productId: 'prod-ms',
      kind: 'DECANTATION',
      sampledFrom: null,
      tankId: null,
      nozzleId: null,
      entryMethod: 'DIRECT_15',
      observedDensity: null,
      observedTempC: null,
      density15: 740.0,
      decantationTankLineId: 'line-1',
      flags: [],
      recordedBy: 'usr-1',
      recordedAt: '2026-10-10T06:30:00.000Z',
    });

    const publish = vi.fn().mockResolvedValue(undefined);
    const useCase = new RecordDensityReading({
      densityReadings: repo,
      events: { publish },
      settings: { densityToleranceKgM3: 3.0 },
    });

    const res = await useCase.execute(
      {
        stationId: 'st-1',
        productId: 'prod-ms',
        kind: 'MORNING',
        entryMethod: 'DIRECT_15',
        density15: 746.0,
        recordedAt: '2026-10-11T06:30:00.000Z',
      },
      baseCtx,
    );

    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.flags).toEqual([]);
  });

  it('does NOT flag UNEXPLAINED_JUMP if an intervening Decantation occurred', async () => {
    const repo = new InMemoryDensityRepo();
    repo.readings.push({
      id: 'prev-reading',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-10-10',
      productId: 'prod-ms',
      kind: 'MORNING',
      sampledFrom: null,
      tankId: null,
      nozzleId: null,
      entryMethod: 'DIRECT_15',
      observedDensity: null,
      observedTempC: null,
      density15: 740.0,
      decantationTankLineId: null,
      flags: [],
      recordedBy: 'usr-1',
      recordedAt: '2026-10-10T06:30:00.000Z',
    });

    repo.interveningDecantation = true;

    const publish = vi.fn().mockResolvedValue(undefined);
    const useCase = new RecordDensityReading({
      densityReadings: repo,
      events: { publish },
      settings: { densityToleranceKgM3: 3.0 },
    });

    const res = await useCase.execute(
      {
        stationId: 'st-1',
        productId: 'prod-ms',
        kind: 'MORNING',
        entryMethod: 'DIRECT_15',
        density15: 746.0,
        recordedAt: '2026-10-11T06:30:00.000Z',
      },
      baseCtx,
    );

    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.flags).toEqual([]);
  });

  it('rejects station mismatch', async () => {
    const repo = new InMemoryDensityRepo();
    const useCase = new RecordDensityReading({
      densityReadings: repo,
      events: { publish: vi.fn() },
    });

    const res = await useCase.execute(
      {
        stationId: 'foreign-station',
        productId: 'prod-ms',
        kind: 'MORNING',
        entryMethod: 'DIRECT_15',
        density15: 745.0,
      },
      baseCtx,
    );

    expect(res.success).toBe(false);
  });
});

describe('ListDensityReadings', () => {
  it('lists readings for a station', async () => {
    const repo = new InMemoryDensityRepo();
    repo.readings.push({
      id: 'r-1',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-10-11',
      productId: 'prod-ms',
      kind: 'MORNING',
      sampledFrom: null,
      tankId: null,
      nozzleId: null,
      entryMethod: 'DIRECT_15',
      observedDensity: null,
      observedTempC: null,
      density15: 745.0,
      decantationTankLineId: null,
      flags: [],
      recordedBy: 'usr-1',
      recordedAt: '2026-10-11T06:30:00.000Z',
    });

    const useCase = new ListDensityReadings({ densityReadings: repo });
    const res = await useCase.execute({ stationId: 'st-1' }, baseCtx);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].productName).toBe('Motor Spirit');
  });

  it('validates date range order', async () => {
    const repo = new InMemoryDensityRepo();
    const useCase = new ListDensityReadings({ densityReadings: repo });
    const res = await useCase.execute(
      { stationId: 'st-1', from: '2026-10-12', to: '2026-10-10' },
      baseCtx,
    );
    expect(res.success).toBe(false);
  });
});

describe('GetDensityTodaySummary', () => {
  it('fetches summary for station', async () => {
    const repo = new InMemoryDensityRepo();
    const useCase = new GetDensityTodaySummary({ densityReadings: repo });
    const res = await useCase.execute({ stationId: 'st-1' }, baseCtx);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.totalProducts).toBe(0);
  });
});
