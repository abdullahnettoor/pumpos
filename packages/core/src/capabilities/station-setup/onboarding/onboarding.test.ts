import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator, BusinessEvents, ok, err, conflictError } from '../../../kernel/index.js';
import type { ExecutionContext, Result } from '../../../kernel/index.js';
import { FinalizeStationOnboarding, validateOnboardingDraftForProvisioning } from './index.js';
import type { OnboardingProvisioner } from './index.js';
import type { FinalizeOnboardingResult, OnboardingDraft } from '@pump/shared';

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: null, businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('o') };
}

function validDraft(): OnboardingDraft {
  return {
    station: { name: 'Main Station', code: 'MS1', address: null, phone: null, shiftGraceMinutes: 15, timezone: 'Asia/Kolkata' },
    businessRules: { businessDayStartsAt: '06:00', operatingSchedule: { isTwentyFourSeven: true, days: [] } },
    products: [{ draftId: 'p1', name: 'Petrol', code: 'MS', productType: 'FUEL', stockTracked: true, isTaxable: false, unit: 'Liters', taxConfig: {}, isActive: true, currentPrice: 100 }],
    tanks: [{ draftId: 't1', name: 'Tank 1', productDraftId: 'p1', capacity: 20000, openingQuantity: 5000 }],
    dispensers: [{ draftId: 'd1', name: 'DU 1', code: 'DU-1', status: 'ACTIVE' }],
    nozzles: [{ draftId: 'n1', dispenserDraftId: 'd1', tankDraftId: 't1', productDraftId: 'p1', name: 'N1', openingReading: 0 }],
    shiftTemplates: [{ draftId: 's1', name: 'Day', startTime: '06:00', endTime: '18:00', isActive: true }],
    paymentTerminals: [{ draftId: 'pt1', label: 'POS 1', provider: 'HDFC', terminalCode: 'TID1', supportsCard: true, supportsUpi: true }],
  };
}

class FakeProvisioner implements OnboardingProvisioner {
  calls = 0;
  constructor(private readonly outcome: Result<FinalizeOnboardingResult>) {}
  async provision(): Promise<Result<FinalizeOnboardingResult>> {
    this.calls += 1;
    return this.outcome;
  }
}

const okResult: FinalizeOnboardingResult = {
  station: { id: 'st-1', organizationId: 'org-1', code: 'MS1' } as any,
  summary: { productCount: 1, tankCount: 1, dispenserCount: 1, nozzleCount: 1, shiftTemplateCount: 1, paymentTerminalCount: 1 },
};

describe('validateOnboardingDraftForProvisioning', () => {
  it('passes a complete draft', () => {
    expect(validateOnboardingDraftForProvisioning(validDraft())).toBeNull();
  });
  it('rejects a draft with no tanks', () => {
    const d = validDraft();
    d.tanks = [];
    expect(validateOnboardingDraftForProvisioning(d)).toMatch(/storage tank/);
  });
  it('rejects a nozzle whose fuel mismatches its tank', () => {
    const d = validDraft();
    d.products.push({ draftId: 'p2', name: 'Diesel', code: 'HSD', productType: 'FUEL', stockTracked: true, isTaxable: false, unit: 'Liters', taxConfig: {}, isActive: true, currentPrice: 90 });
    d.nozzles[0].productDraftId = 'p2';
    expect(validateOnboardingDraftForProvisioning(d)).toMatch(/fuel must match/);
  });
  it('rejects a payment terminal that supports neither card nor UPI', () => {
    const d = validDraft();
    d.paymentTerminals[0].supportsCard = false;
    d.paymentTerminals[0].supportsUpi = false;
    expect(validateOnboardingDraftForProvisioning(d)).toMatch(/card and\/or UPI/);
  });
});

describe('FinalizeStationOnboarding', () => {
  it('provisions and emits ONBOARDING_COMPLETED', async () => {
    const store = new InMemoryEventStore();
    const provisioner = new FakeProvisioner(ok(okResult));
    const result = await new FinalizeStationOnboarding({ provisioner, events: new InProcessEventDispatcher({ store }) }).execute(validDraft(), ctx());
    expect(result.success).toBe(true);
    expect(provisioner.calls).toBe(1);
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.ONBOARDING_COMPLETED);
  });

  it('does not provision when the draft is invalid', async () => {
    const provisioner = new FakeProvisioner(ok(okResult));
    const d = validDraft();
    d.products = [];
    const result = await new FinalizeStationOnboarding({ provisioner, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) }).execute(d, ctx());
    expect(result.success).toBe(false);
    expect(provisioner.calls).toBe(0);
  });

  it('surfaces a provisioner conflict and emits no event', async () => {
    const store = new InMemoryEventStore();
    const provisioner = new FakeProvisioner(err(conflictError('Station code "MS1" already exists')));
    const result = await new FinalizeStationOnboarding({ provisioner, events: new InProcessEventDispatcher({ store }) }).execute(validDraft(), ctx());
    expect(result.success).toBe(false);
    expect(store.events).toHaveLength(0);
  });
});
