import { describe, expect, it } from 'vitest';
import {
  FinalizeStationOnboarding,
  FixedClock,
  SequentialIdGenerator,
  type EventPublisher,
  type ExecutionContext,
} from '@pump/core';
import type { DbClient } from '@pump/db';
import { schema } from '@pump/db';
import type { OnboardingDraft } from '@pump/shared';
import { createFuelVatConfig } from '@pump/shared';
import { runInTransaction } from './transaction.js';
import { DrizzleOnboardingProvisioner } from './onboarding-provisioner.js';

/**
 * Station onboarding provisions many tables and then appends
 * ONBOARDING_COMPLETED. Issue #161 makes the two one unit of work, so a failure
 * in either leaves no half-provisioned station behind.
 *
 * The fake DB below models exactly that: `transaction()` hands the callback a
 * draft write log and only merges it into the committed log if the callback
 * returns; a throw (or a rolled-back failed Result) discards the draft. That
 * lets us assert the guarantee — nothing committed — without Postgres.
 */

interface Write {
  table: unknown;
  values: unknown;
}

const stubRow = (table: unknown): Record<string, unknown> =>
  table === schema.stations
    ? { id: 'station-1', settings: {}, code: 'ST1' }
    : { id: `${String((table as { _?: { name?: string } })._?.name ?? 'row')}-1` };

const makeChainable = (result: unknown): unknown => {
  const target: Record<string, unknown> = {
    returning: () => Promise.resolve(result),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  const proxy: unknown = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return () => proxy;
    },
  });
  return proxy;
};

/** A DB whose writes only land in `committed` when the transaction returns. */
function transactionalDb(committed: Write[], failOnTable?: unknown) {
  const drafts = new WeakMap<object, Write[]>();
  const db = {
    transaction: async (execute: (tx: DbClient) => Promise<unknown>) => {
      const draft: Write[] = [];
      const tx = {
        select: () => makeChainable([]),
        update: (table: unknown) => makeChainable([stubRow(table)]),
        insert: (table: unknown) => ({
          values: (values: unknown) => {
            if (table === failOnTable) throw new Error('injected provisioning failure');
            draft.push({ table, values });
            return makeChainable([stubRow(table)]);
          },
        }),
      } as unknown as DbClient;
      drafts.set(tx as object, draft);
      const result = await execute(tx);
      committed.push(...draft);
      return result;
    },
  } as unknown as DbClient;
  return { db, draftFor: (tx: DbClient) => drafts.get(tx as object)! };
}

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: 'owner-1',
  correlationId: 'correlation-1',
  clock: new FixedClock(new Date('2026-09-12T08:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
};

const validDraft = (): OnboardingDraft =>
  ({
    station: {
      name: 'Test Station',
      code: 'ST1',
      address: '',
      phone: '',
      timezone: 'Asia/Kolkata',
      shiftGraceMinutes: 15,
    },
    businessRules: {
      businessDayStartsAt: '06:00',
      operatingSchedule: { isTwentyFourSeven: true, days: [] },
    },
    products: [
      {
        draftId: 'p1',
        name: 'Petrol',
        code: 'MS',
        productType: 'FUEL',
        stockTracked: true,
        isTaxable: false,
        taxCategory: 'FUEL_VAT',
        unit: 'L',
        taxConfig: createFuelVatConfig({ vat_rate: 20 }),
        isActive: true,
        currentPrice: 100,
      },
    ],
    tanks: [
      { draftId: 't1', name: 'Tank 1', productDraftId: 'p1', capacity: 10000, openingQuantity: 0 },
    ],
    dispensers: [{ draftId: 'd1', name: 'DU 1', code: 'DU1', status: 'ACTIVE' }],
    nozzles: [
      {
        draftId: 'n1',
        name: 'N1',
        dispenserDraftId: 'd1',
        tankDraftId: 't1',
        productDraftId: 'p1',
        openingReading: 0,
      },
    ],
    shiftTemplates: [],
    paymentTerminals: [],
  }) as unknown as OnboardingDraft;

const finalize = (committed: Write[], eventPublisherFactory?: (tx: DbClient) => EventPublisher) => {
  const { db, draftFor } = transactionalDb(committed);
  return {
    draftFor,
    run: () =>
      runInTransaction(
        db,
        (tx, events) =>
          new FinalizeStationOnboarding({
            provisioner: new DrizzleOnboardingProvisioner(tx),
            events,
          }).execute(validDraft(), ctx),
        eventPublisherFactory,
      ),
  };
};

describe('Station onboarding finalization is atomic (#161)', () => {
  it('commits the whole station setup and one completion event on success', async () => {
    const committed: Write[] = [];
    const published: unknown[] = [];
    const { run } = finalize(committed, () => ({
      publish: async (events) => {
        published.push(...events);
      },
    }));

    const result = await run();

    expect(result.success).toBe(true);
    for (const table of [
      schema.stations,
      schema.products,
      schema.tanks,
      schema.dispenserUnits,
      schema.nozzles,
      schema.fuelPrices,
    ]) {
      expect(committed.some((w) => w.table === table)).toBe(true);
    }
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ eventType: 'ONBOARDING_COMPLETED' });
  });

  it('rolls back every provisioning write when the event append fails', async () => {
    const committed: Write[] = [];
    let sawProvisionedWrites = false;
    const { draftFor, run } = finalize(committed, (tx) => ({
      publish: async () => {
        // The station setup is already written inside the transaction...
        sawProvisionedWrites = draftFor(tx).some((w) => w.table === schema.stations);
        throw new Error('injected event append failure');
      },
    }));

    await expect(run()).rejects.toThrow('injected event append failure');

    expect(sawProvisionedWrites).toBe(true);
    // ...and none of it survives the failure.
    expect(committed).toEqual([]);
  });

  it('rolls back the station row when a later provisioning write fails', async () => {
    const committed: Write[] = [];
    // Nozzles are inserted well after the station, products, and tanks.
    const { db } = transactionalDb(committed, schema.nozzles);

    await expect(
      runInTransaction(db, (tx, events) =>
        new FinalizeStationOnboarding({
          provisioner: new DrizzleOnboardingProvisioner(tx),
          events,
        }).execute(validDraft(), ctx),
      ),
    ).rejects.toThrow('injected provisioning failure');

    expect(committed).toEqual([]);
  });
});
