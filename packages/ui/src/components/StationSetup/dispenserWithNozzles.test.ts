import { describe, expect, it } from 'vitest';
import {
  dispenserWithNozzlesBody,
  NOZZLE_SELECTION_MESSAGE,
  standardNozzleLayout,
} from './dispenserWithNozzles.js';

const nozzle = { name: 'N1', productId: 'p-ms', tankId: 't-ms', currentReading: 1000 };

describe('dispenserWithNozzlesBody', () => {
  it('builds one body with the dispenser and every nozzle', () => {
    expect(
      dispenserWithNozzlesBody({
        stationId: 'st-1',
        name: 'Dispenser Unit 1',
        code: 'du-01',
        nozzles: [nozzle, { ...nozzle, name: 'N2', currentReading: 0 }],
      }),
    ).toEqual({
      ok: true,
      body: {
        stationId: 'st-1',
        name: 'Dispenser Unit 1',
        code: 'DU-01',
        status: 'ACTIVE',
        nozzles: [
          { name: 'N1', tankId: 't-ms', productId: 'p-ms', currentReading: 1000 },
          { name: 'N2', tankId: 't-ms', productId: 'p-ms', currentReading: 0 },
        ],
      },
    });
  });

  it('allows a dispenser with no nozzles yet', () => {
    const draft = dispenserWithNozzlesBody({
      stationId: 'st-1',
      name: 'D',
      code: 'D',
      nozzles: [],
    });
    expect(draft.ok && draft.body.nozzles).toEqual([]);
  });

  it.each([
    ['tank', { ...nozzle, tankId: '' }],
    ['product', { ...nozzle, productId: '' }],
  ])('refuses a nozzle with no %s', (_, bad) => {
    expect(
      dispenserWithNozzlesBody({ stationId: 'st-1', name: 'D', code: 'D', nozzles: [nozzle, bad] }),
    ).toEqual({ ok: false, message: NOZZLE_SELECTION_MESSAGE });
  });
});

describe('standardNozzleLayout', () => {
  const products = [
    { id: 'p-ms', code: 'MS' },
    { id: 'p-hsd', code: 'HSD' },
    { id: 'p-xp', code: 'XP95' },
  ];
  const tanks = [
    { id: 't-ms', productId: 'p-ms' },
    { id: 't-hsd', productId: 'p-hsd' },
  ];
  const row = (name: string, fuel: 'ms' | 'hsd') => ({
    name,
    productId: `p-${fuel}`,
    tankId: `t-${fuel}`,
    currentReading: 1000,
  });

  it('fills a dual dispenser: one Petrol and one Diesel nozzle, named after the existing ones', () => {
    expect(standardNozzleLayout({ perFuel: 1, products, tanks, existingNozzles: 3 })).toEqual([
      row('N4', 'ms'),
      row('N5', 'hsd'),
    ]);
  });

  it('fills a quad dispenser: two of each', () => {
    expect(standardNozzleLayout({ perFuel: 2, products, tanks, existingNozzles: 0 })).toEqual([
      row('N1', 'ms'),
      row('N2', 'ms'),
      row('N3', 'hsd'),
      row('N4', 'hsd'),
    ]);
  });

  it('skips a fuel with no tank', () => {
    expect(
      standardNozzleLayout({ perFuel: 2, products, tanks: [tanks[1]], existingNozzles: 0 }),
    ).toEqual([row('N1', 'hsd'), row('N2', 'hsd')]);
  });
});
