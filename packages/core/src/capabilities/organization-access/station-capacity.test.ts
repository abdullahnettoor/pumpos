import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  ok,
} from '../../kernel/index.js';
import type { ExecutionContext, Result } from '../../kernel/index.js';
import type { FinalizeOnboardingResult, OnboardingDraft } from '@pump/shared';
import { FinalizeStationOnboarding } from '../station-setup/onboarding/index.js';
import { ensureStationCapacity, type StationCapacityPort } from './station-capacity.js';
import { buildAccessDocument } from './resolve-access.js';
import type { OrganizationAccessInputs } from './ports.js';

/**
 * The `station_count` Limit is a commercial rule, so it is enforced where it
 * cannot be bypassed: inside the onboarding transaction, under a lock on the
 * Organization. These tests pin the three outcomes that matter — the first
 * Station succeeds, the second is refused with usable detail, and an override
 * permits more — plus the concurrency property the lock exists for.
 */

const inputs = (over: Partial<OrganizationAccessInputs> = {}): OrganizationAccessInputs => ({
  plan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  grantedCapabilities: [],
  limitOverrides: {},
  usage: { station_count: 0 },
  ...over,
});

/**
 * A capacity port backed by a mutable Station count, with a lock that
 * genuinely serializes: this is what the database gives us via
 * `SELECT … FOR UPDATE` on the Organization row.
 */
function capacityPort(state: { stations: number; override?: number }) {
  let queue: Promise<void> = Promise.resolve();
  const port: StationCapacityPort & { held: number; maxHeld: number } = {
    held: 0,
    maxHeld: 0,
    lockOrganization: () => {
      const wait = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      return wait.then(() => {
        port.held += 1;
        port.maxHeld = Math.max(port.maxHeld, port.held);
        // The lock is held for the rest of the "transaction"; tests release it
        // by calling `releaseLock` after their provisioning step.
        (port as any).releaseLock = () => {
          port.held -= 1;
          release();
        };
      });
    },
    load: async () =>
      inputs({
        usage: { station_count: state.stations },
        limitOverrides: state.override ? { station_count: state.override } : {},
      }),
  };
  return port;
}

const ctx = (): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: 'owner-1',
  correlationId: 'correlation-1',
  clock: new FixedClock(new Date('2026-09-19T08:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
});

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
        taxConfig: { vat_rate: 20 },
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

const provisionedStation = {
  station: { id: 'station-1', code: 'ST1' },
  summary: {},
} as unknown as FinalizeOnboardingResult;

/** Provisioner that "creates" a Station by incrementing the counted usage. */
function provisioner(state: { stations: number }) {
  return {
    calls: 0,
    async provision(): Promise<Result<FinalizeOnboardingResult>> {
      this.calls += 1;
      state.stations += 1;
      return ok(provisionedStation);
    },
  };
}

describe('ensureStationCapacity', () => {
  it('allows the first Station under the CORE baseline', async () => {
    const result = await ensureStationCapacity(capacityPort({ stations: 0 }), 'org-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ value: 1, used: 0 });
  });

  it('refuses the second with LIMIT_REACHED and a usable resolution', async () => {
    const result = await ensureStationCapacity(capacityPort({ stations: 1 }), 'org-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('LIMIT_REACHED');
    expect(result.error.message).toContain('one Station');
    expect(result.error.details).toEqual({
      limit: 'station_count',
      value: 1,
      used: 1,
      resolution: 'CONTACT_PUMPOS',
      actionLabel: 'Contact PumpOS',
    });
  });

  it('counts every Station row, including inactive and partially onboarded ones', async () => {
    // The port counts rows, not statuses — deactivating a Station frees nothing.
    const result = await ensureStationCapacity(capacityPort({ stations: 3, override: 3 }), 'org-1');
    expect(result.success).toBe(false);
  });

  it('permits another Station when an override raises the Limit', async () => {
    const result = await ensureStationCapacity(capacityPort({ stations: 1, override: 3 }), 'org-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ value: 3, used: 1 });
  });

  it('locks the Organization before reading usage', async () => {
    const order: string[] = [];
    const port: StationCapacityPort = {
      lockOrganization: async () => {
        order.push('lock');
      },
      load: async () => {
        order.push('load');
        return inputs();
      },
    };

    await ensureStationCapacity(port, 'org-1');

    expect(order).toEqual(['lock', 'load']);
  });
});

describe('after a Limit is lowered below current usage', () => {
  // A downgrade must not strand an Organization: the Stations it already has
  // keep operating, and only growth stops. Nothing deactivates a Station.
  it('refuses another Station without disturbing the ones that exist', async () => {
    const result = await ensureStationCapacity(capacityPort({ stations: 3, override: 1 }), 'org-1');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('LIMIT_REACHED');
    // The message reports the contracted allowance, and usage above it is
    // simply carried — the error is about adding, never about removing.
    expect(result.error.details).toMatchObject({ value: 1, used: 3 });
  });

  it('reports the over-limit usage honestly in the Access Document', async () => {
    const document = buildAccessDocument({
      inputs: inputs({ limitOverrides: { station_count: 1 }, usage: { station_count: 3 } }),
      role: 'Owner',
    });

    expect(document.limits.station_count).toEqual({ value: 1, used: 3, reached: true });
  });

  it('allows growth again once the override is raised back', async () => {
    const result = await ensureStationCapacity(capacityPort({ stations: 3, override: 4 }), 'org-1');

    expect(result.success).toBe(true);
  });
});

describe('onboarding under the Station Limit', () => {
  const finalize = (deps: {
    capacity: StationCapacityPort;
    provisioner: any;
    store: InMemoryEventStore;
  }) =>
    new FinalizeStationOnboarding({
      provisioner: deps.provisioner,
      capacity: deps.capacity,
      events: new InProcessEventDispatcher({ store: deps.store }),
    }).execute(validDraft(), ctx());

  it('provisions the first Station and emits ONBOARDING_COMPLETED', async () => {
    const state = { stations: 0 };
    const store = new InMemoryEventStore();
    const provision = provisioner(state);

    const result = await finalize({ capacity: capacityPort(state), provisioner: provision, store });

    expect(result.success).toBe(true);
    expect(provision.calls).toBe(1);
    expect(store.events.map((e) => e.eventType)).toEqual(['ONBOARDING_COMPLETED']);
  });

  it('refuses the second without provisioning or emitting anything', async () => {
    const state = { stations: 1 };
    const store = new InMemoryEventStore();
    const provision = provisioner(state);

    const result = await finalize({ capacity: capacityPort(state), provisioner: provision, store });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('LIMIT_REACHED');
    expect(provision.calls).toBe(0);
    expect(store.events).toHaveLength(0);
  });

  it('cannot be exceeded by concurrent requests', async () => {
    // Both requests start when usage is 0 of 1. Without the lock both would
    // read "0 used" and provision; with it, the second sees the first's row.
    const state = { stations: 0 };
    const store = new InMemoryEventStore();
    const provision = provisioner(state);
    const port = capacityPort(state);

    const runOne = async () => {
      const result = await new FinalizeStationOnboarding({
        provisioner: provision,
        capacity: port,
        events: new InProcessEventDispatcher({ store }),
      }).execute(validDraft(), ctx());
      (port as any).releaseLock?.();
      return result;
    };

    const [first, second] = await Promise.all([runOne(), runOne()]);

    expect([first.success, second.success].sort()).toEqual([false, true]);
    expect(provision.calls).toBe(1);
    expect(state.stations).toBe(1);
    const refusal = first.success ? second : first;
    if (!refusal.success) expect(refusal.error.code).toBe('LIMIT_REACHED');
  });
});
