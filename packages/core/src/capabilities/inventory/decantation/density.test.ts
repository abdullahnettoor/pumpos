import { describe, expect, it, vi } from 'vite-plus/test';
import { density15FromObserved, roundDensity } from '@pump/shared';
import {
  BusinessEvents,
  FixedClock,
  SequentialIdGenerator,
  type ExecutionContext,
} from '../../../kernel/index.js';
import type {
  DensityReading,
  DensityReadingListQuery,
  DensityReadingRepository,
  DensityReadingWithContext,
} from './ports.js';
import { RecordDensityReading, type RecordDensityReadingDeps } from './record-density-reading.js';
import { ListDensityReadings } from './list-density-readings.js';
import { GetDensityTodaySummary } from './get-density-today-summary.js';
import { buildDensityTodaySummary } from './build-density-today-summary.js';

class InMemoryDensityRepo implements DensityReadingRepository {
  readings: DensityReading[] = [];
  interveningDecantation = false;

  async saveMany(items: DensityReading[]): Promise<void> {
    this.readings.push(...items);
  }

  fuelProducts: Array<{ id: string; name: string; code: string }> = [];
  interveningArgs: Array<{ after: string; before: string }> = [];

  async findLatestForProduct(
    organizationId: string,
    stationId: string,
    productId: string,
    before?: { businessDate: string; recordedAt: string },
  ): Promise<DensityReading | null> {
    const matching = this.readings.filter(
      (r) =>
        r.organizationId === organizationId &&
        r.stationId === stationId &&
        r.productId === productId &&
        (!before ||
          r.businessDate < before.businessDate ||
          (r.businessDate === before.businessDate && r.recordedAt <= before.recordedAt)),
    );
    if (!matching.length) return null;
    matching.sort((a, b) =>
      a.businessDate === b.businessDate
        ? b.recordedAt.localeCompare(a.recordedAt)
        : b.businessDate.localeCompare(a.businessDate),
    );
    return matching[0]!;
  }

  async hasInterveningDecantation(
    _orgId: string,
    _stationId: string,
    _productId: string,
    after: string,
    before: string,
  ): Promise<boolean> {
    this.interveningArgs.push({ after, before });
    return this.interveningDecantation;
  }

  async list(query: DensityReadingListQuery): Promise<DensityReadingWithContext[]> {
    return this.readings
      .filter((r) => r.organizationId === query.organizationId && r.stationId === query.stationId)
      .map((r) => ({ ...r, productName: 'Motor Spirit', productCode: 'MS' }));
  }

  async listFuelProductsWithActiveTanks() {
    return this.fuelProducts;
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

    const expected15 = roundDensity(density15FromObserved(745.0, 28.5, {}), 2);
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

  it.each([
    [743.04, false],
    [736.96, false],
    [743.06, true],
    [736.94, true],
    // ±3.05 ties: the magnitude rounds to 3.1 either way.
    [743.05, true],
    [736.95, true],
  ])(
    'judges a jump on the change as shown, like the client (#556): %s after 740 at tolerance 3 → %s',
    async (density15, jump) => {
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
      const res = await new RecordDensityReading({
        densityReadings: repo,
        events: { publish: vi.fn().mockResolvedValue(undefined) },
        settings: { densityToleranceKgM3: 3.0 },
      }).execute(
        {
          stationId: 'st-1',
          productId: 'prod-ms',
          kind: 'MORNING',
          entryMethod: 'DIRECT_15',
          density15,
          recordedAt: '2026-10-11T06:30:00.000Z',
        },
        baseCtx,
      );
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.flags.includes('UNEXPLAINED_JUMP')).toBe(jump);
    },
  );

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

  it('uses only active fuel products with an active tank as the denominator (no fallback)', async () => {
    const repo = new InMemoryDensityRepo();
    repo.fuelProducts = [{ id: 'prod-ms', name: 'Motor Spirit', code: 'MS' }];
    const res = await new GetDensityTodaySummary({ densityReadings: repo }).execute(
      { stationId: 'st-1', businessDate: '2026-10-11' },
      baseCtx,
    );
    expect(res.success && res.data.totalProducts).toBe(1);
    expect(res.success && res.data.missingProducts.map((p) => p.productCode)).toEqual(['MS']);
  });
});

const mk = (id: string, businessDate: string, recordedAt: string, density15: number) => ({
  id,
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDate,
  productId: 'prod-ms',
  kind: 'MORNING' as const,
  sampledFrom: null,
  tankId: null,
  nozzleId: null,
  entryMethod: 'DIRECT_15' as const,
  observedDensity: null,
  observedTempC: null,
  density15,
  decantationTankLineId: null,
  flags: [],
  recordedBy: null,
  recordedAt,
});

describe('buildDensityTodaySummary', () => {
  const products = [
    { id: 'prod-ms', name: 'Motor Spirit', code: 'MS' },
    { id: 'prod-hsd', name: 'Diesel', code: 'HSD' },
  ];

  it('picks the newest reading as latestToday regardless of input order', () => {
    const early = mk('e', '2026-10-11', '2026-10-11T01:00:00.000Z', 750);
    const late = mk('l', '2026-10-11', '2026-10-11T05:00:00.000Z', 752);
    for (const readings of [
      [early, late],
      [late, early],
    ]) {
      const s = buildDensityTodaySummary({ businessDate: '2026-10-11', products, readings });
      expect(s.products[0]!.latestToday?.id).toBe('l');
    }
  });

  it('computes missing, trend window and values server-side', () => {
    const s = buildDensityTodaySummary({
      businessDate: '2026-10-11',
      products,
      readings: [
        mk('a', '2026-10-11', '2026-10-11T01:00:00.000Z', 752),
        mk('b', '2026-10-09', '2026-10-09T01:00:00.000Z', 749),
        mk('old', '2026-09-01', '2026-09-01T01:00:00.000Z', 700),
      ],
    });
    expect(s.totalProducts).toBe(2);
    expect(s.recordedCount).toBe(1);
    expect(s.missingCount).toBe(1);
    expect(s.missingProducts.map((p) => p.productId)).toEqual(['prod-hsd']);
    expect(s.products[0]!.trend14d).toHaveLength(14);
    expect(s.products[0]!.trendValues).toEqual([749, 752]);
  });

  it('does not fall back to all fuel products when none are supplied', () => {
    const s = buildDensityTodaySummary({ businessDate: '2026-10-11', products: [], readings: [] });
    expect(s.totalProducts).toBe(0);
    expect(s.missingCount).toBe(0);
  });
});

describe('RecordDensityReading jump comparison order', () => {
  it('compares a back-dated entry with the reading immediately before it in register order', async () => {
    const repo = new InMemoryDensityRepo();
    repo.readings.push(
      mk('d8', '2026-10-08', '2026-10-08T01:00:00.000Z', 740),
      mk('d10', '2026-10-10', '2026-10-10T01:00:00.000Z', 760),
    );
    const useCase = new RecordDensityReading({
      densityReadings: repo,
      events: { publish: vi.fn() },
      settings: { densityToleranceKgM3: 3 },
    });
    // Back-dated to the 9th but entered now: predecessor is the 8th (740), not the 10th.
    const res = await useCase.execute(
      {
        stationId: 'st-1',
        productId: 'prod-ms',
        kind: 'MORNING',
        entryMethod: 'DIRECT_15',
        density15: 741,
        businessDate: '2026-10-09',
        recordedAt: '2026-10-11T08:00:00.000Z',
      },
      baseCtx,
    );
    expect(res.success && res.data.flags).toEqual([]);
  });

  it('checks for a Decantation inclusively between prev and new instants', async () => {
    const repo = new InMemoryDensityRepo();
    repo.readings.push(mk('p', '2026-10-10', '2026-10-10T01:00:00.000Z', 740));
    await new RecordDensityReading({
      densityReadings: repo,
      events: { publish: vi.fn() },
    }).execute(
      {
        stationId: 'st-1',
        productId: 'prod-ms',
        kind: 'MORNING',
        entryMethod: 'DIRECT_15',
        density15: 750,
        recordedAt: '2026-10-11T01:00:00.000Z',
      },
      baseCtx,
    );
    expect(repo.interveningArgs).toEqual([
      { after: '2026-10-10T01:00:00.000Z', before: '2026-10-11T01:00:00.000Z' },
    ]);
  });

  it('does not feed the jump tolerance into the 15 °C solver', async () => {
    const make = (tol: number) =>
      new RecordDensityReading({
        densityReadings: new InMemoryDensityRepo(),
        events: { publish: vi.fn() },
        settings: { densityToleranceKgM3: tol },
      }).execute(
        {
          stationId: 'st-1',
          productId: 'prod-ms',
          kind: 'MORNING',
          entryMethod: 'HYDROMETER',
          observedDensity: 745,
          observedTempC: 34,
        },
        baseCtx,
      );
    const [a, b] = await Promise.all([make(0.5), make(50)]);
    expect(a.success && b.success && a.data.density15).toBe(b.success && b.data.density15);
    expect(a.success && a.data.density15).toBe(roundDensity(density15FromObserved(745, 34, {}), 2));
  });
});
