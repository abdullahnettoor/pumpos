import { describe, expect, it } from 'vitest';
import type { OnboardingDraft } from '@pump/shared';
import { createFuelVatConfig } from '@pump/shared';
import type { DbClient } from '@pump/db';
import { schema } from '@pump/db';
import { DrizzleOnboardingProvisioner } from './onboarding-provisioner.js';

/**
 * The onboarding provisioner is the one place that turns a fuel draft into a
 * persisted `products` row. Issue #133 is a persistence bug: fuels were inserted
 * without a tax category, so the table's `GST` default produced a 0% GST fuel
 * product instead of a Fuel VAT one. These tests pin the row that actually hits
 * the database.
 *
 * Rather than stand up Postgres, we drive the real adapter against a recording
 * fake of the caller's transaction handle: every query builder is a chainable that
 * resolves to a stub row and records each `insert(table).values(...)`. That lets
 * us assert exactly what column values the provisioner writes for the products
 * table — the persistence contract #133 is about — while the rest of the
 * multi-table insert runs through unchanged.
 */

interface RecordedInsert {
  table: unknown;
  values: unknown;
}

const stubRow = (table: unknown): Record<string, unknown> => {
  // Return the shape each `.returning()` consumer destructures. A stable id per
  // table is enough for the draft-local → real id maps the provisioner builds.
  if (table === schema.stations) {
    return { id: 'station-1', settings: {}, code: 'ST1' };
  }
  return { id: `${String((table as { _?: { name?: string } })._?.name ?? 'row')}-1` };
};

const makeChainable = (result: unknown): unknown => {
  // A Proxy so any query-builder method (from/where/orderBy/limit/set/onConflict…)
  // chains, while `returning()` and awaiting both resolve to the stub result.
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

const makeFakeDb = (inserts: RecordedInsert[]): DbClient => {
  const db = {
    select: () => makeChainable([]),
    update: (table: unknown) => makeChainable([stubRow(table)]),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return makeChainable([stubRow(table)]);
      },
    }),
  };
  return db as unknown as DbClient;
};

const baseDraft = (): OnboardingDraft =>
  ({
    station: {
      name: 'Test Station',
      code: ' st1',
      address: '',
      phone: '',
      timezone: 'Asia/Kolkata',
      shiftGraceMinutes: 15,
    },
    businessRules: {
      businessDayStartsAt: '06:00',
      operatingSchedule: { isTwentyFourSeven: true, days: [] },
    },
    products: [],
    tanks: [],
    dispensers: [],
    nozzles: [],
    shiftTemplates: [],
    paymentTerminals: [],
  }) as unknown as OnboardingDraft;

const fuelDraft = (over: Record<string, unknown>) => ({
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
  ...over,
});

const provisionProductRow = async (product: Record<string, unknown>) => {
  const inserts: RecordedInsert[] = [];
  const draft = baseDraft();
  (draft.products as unknown[]) = [product];
  const provisioner = new DrizzleOnboardingProvisioner(makeFakeDb(inserts));
  const result = await provisioner.provision({
    organizationId: 'org-1',
    actorId: 'user-1',
    draft,
  });
  expect(result.success).toBe(true);
  const productInsert = inserts.find((i) => i.table === schema.products);
  expect(productInsert, 'a products row must be inserted').toBeDefined();
  return productInsert!.values as Record<string, unknown>;
};

describe('DrizzleOnboardingProvisioner writes on the caller transaction (#161)', () => {
  it('never opens its own transaction — the injected client is the unit of work', async () => {
    const inserts: RecordedInsert[] = [];
    const db = makeFakeDb(inserts);
    // A client with no `transaction` method at all: if the adapter tried to
    // open a nested unit of work it would throw instead of provisioning.
    expect((db as unknown as Record<string, unknown>).transaction).toBeUndefined();
    const result = await new DrizzleOnboardingProvisioner(db).provision({
      organizationId: 'org-1',
      actorId: 'user-1',
      draft: baseDraft(),
    });
    expect(result.success).toBe(true);
    expect(inserts.some((i) => i.table === schema.stations)).toBe(true);
  });
});

describe('DrizzleOnboardingProvisioner persists fuel under Fuel VAT (#133)', () => {
  it('stores taxCategory FUEL_VAT explicitly, never relying on the GST default', async () => {
    const row = await provisionProductRow(fuelDraft({}));
    expect(row.taxCategory).toBe('FUEL_VAT');
  });

  it('persists a VAT-shaped tax config and no gst_rate', async () => {
    const row = await provisionProductRow(
      fuelDraft({ taxConfig: createFuelVatConfig({ vat_rate: 20 }) }),
    );
    const cfg = row.taxConfig as Record<string, unknown>;
    expect(cfg.vat_rate).toBe(20);
    expect(cfg).not.toHaveProperty('gst_rate');
  });

  it('re-homes a legacy GST-shaped draft onto FUEL_VAT instead of a 0% GST product', async () => {
    // A draft resumed from an old client: GST-shaped, no explicit category.
    const legacy = fuelDraft({
      isTaxable: false,
      taxCategory: undefined,
      taxConfig: { gst_rate: 0, hsn_code: '2710' },
    });
    const row = await provisionProductRow(legacy);
    expect(row.taxCategory).toBe('FUEL_VAT');
    const cfg = row.taxConfig as Record<string, unknown>;
    expect(cfg).not.toHaveProperty('gst_rate');
    expect(cfg.vat_rate).toBe(0);
    // The legacy "GST applies" flag must not survive onto a VAT product.
    expect(row.isTaxable).toBe(false);
  });
});
