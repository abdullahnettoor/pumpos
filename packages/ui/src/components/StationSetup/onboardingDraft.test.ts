import { describe, expect, it } from 'vite-plus/test';
import type { OnboardingProductDraft, OnboardingTankDraft } from '@pump/shared';
import { createFuelDraft, createTankDraft, standardOnboardingNozzles } from './onboardingDraft.js';

const fuel = (draftId: string, name: string, code: string): OnboardingProductDraft => ({
  ...createFuelDraft(),
  draftId,
  name,
  code,
});

const tank = (draftId: string, name: string, productDraftId: string): OnboardingTankDraft => ({
  ...createTankDraft(productDraftId),
  draftId,
  name,
});

// Codes a station typed itself, none of them MS / HSD (#638).
const products = [
  fuel('p-petrol', 'Petrol', 'DEMO-MS-a753c7'),
  fuel('p-diesel', 'Diesel', 'my-diesel'),
  fuel('p-xp', 'XP95', 'XP'),
];
const tanks = [tank('t-petrol', 'Tank 1', 'p-petrol'), tank('t-diesel', 'Tank 2', 'p-diesel')];

describe('standardOnboardingNozzles', () => {
  it('maps dual auto-fill: one nozzle per fuel with a tank, matched by product not code', () => {
    const nozzles = standardOnboardingNozzles({
      perFuel: 1,
      dispenserDraftId: 'du-1',
      products,
      tanks,
      existingNozzles: 0,
    });

    expect(nozzles.map((n) => [n.name, n.productDraftId, n.tankDraftId])).toEqual([
      ['N1', 'p-diesel', 't-diesel'],
      ['N2', 'p-petrol', 't-petrol'],
    ]);
  });

  it('maps quad auto-fill: two nozzles per fuel', () => {
    const nozzles = standardOnboardingNozzles({
      perFuel: 2,
      dispenserDraftId: 'du-1',
      products,
      tanks,
      existingNozzles: 2,
    });

    expect(nozzles.map((n) => [n.name, n.productDraftId, n.tankDraftId])).toEqual([
      ['N3', 'p-diesel', 't-diesel'],
      ['N4', 'p-diesel', 't-diesel'],
      ['N5', 'p-petrol', 't-petrol'],
      ['N6', 'p-petrol', 't-petrol'],
    ]);
  });

  it('skips a fuel with no tank rather than pairing it with an unrelated one', () => {
    const nozzles = standardOnboardingNozzles({
      perFuel: 1,
      dispenserDraftId: 'du-1',
      products,
      tanks: [tanks[0]],
      existingNozzles: 0,
    });

    expect(nozzles.map((n) => n.productDraftId)).toEqual(['p-petrol']);
  });

  it('links every nozzle to the new dispenser and leaves the opening reading empty', () => {
    const nozzles = standardOnboardingNozzles({
      perFuel: 2,
      dispenserDraftId: 'du-9',
      products,
      tanks,
      existingNozzles: 0,
    });

    expect(nozzles.every((n) => n.dispenserDraftId === 'du-9')).toBe(true);
    expect(nozzles.every((n) => n.openingReading === 0)).toBe(true);
    expect(new Set(nozzles.map((n) => n.draftId)).size).toBe(nozzles.length);
  });
});
