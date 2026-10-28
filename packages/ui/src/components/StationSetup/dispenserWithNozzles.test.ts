import { describe, expect, it } from 'vite-plus/test';
import {
  dispenserWithNozzlesBody,
  fuelsWithTanks,
  NOZZLE_READING_MESSAGE,
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

  it.each([
    ['empty', null],
    ['negative', -1],
    ['not a number', Number.NaN],
  ])('refuses a nozzle whose opening reading is %s', (_, reading) => {
    expect(
      dispenserWithNozzlesBody({
        stationId: 'st-1',
        name: 'D',
        code: 'D',
        nozzles: [nozzle, { ...nozzle, currentReading: reading }],
      }),
    ).toEqual({ ok: false, message: NOZZLE_READING_MESSAGE });
  });

  it('accepts an opening reading of zero for a new meter', () => {
    const draft = dispenserWithNozzlesBody({
      stationId: 'st-1',
      name: 'D',
      code: 'D',
      nozzles: [{ ...nozzle, currentReading: 0 }],
    });
    expect(draft.ok && draft.body.nozzles[0].currentReading).toBe(0);
  });
});

describe('fuelsWithTanks', () => {
  it('ignores product codes: any code a station typed works (#638)', () => {
    const products = [
      { id: 'p-1', name: 'Petrol', code: 'DEMO-MS-a753c7' },
      { id: 'p-2', name: 'Diesel', code: 'my-diesel' },
    ];
    const tanks = [
      { id: 't-1', name: 'T1', productId: 'p-1' },
      { id: 't-2', name: 'T2', productId: 'p-2' },
    ];
    expect(fuelsWithTanks({ products, tanks }).map((f) => [f.product.id, f.tankId])).toEqual([
      ['p-2', 't-2'],
      ['p-1', 't-1'],
    ]);
  });

  it('orders fuels by name and pairs each with its first tank by name', () => {
    const products = [
      { id: 'p-xp', name: 'XP95' },
      { id: 'p-ms', name: 'Petrol' },
    ];
    const tanks = [
      { id: 't-b', name: 'Tank 10', productId: 'p-ms' },
      { id: 't-a', name: 'Tank 2', productId: 'p-ms' },
      { id: 't-xp', name: 'Tank XP', productId: 'p-xp' },
    ];
    expect(fuelsWithTanks({ products, tanks }).map((f) => f.tankId)).toEqual(['t-a', 't-xp']);
  });

  it('leaves out a fuel with no tank', () => {
    expect(fuelsWithTanks({ products: [{ id: 'p-1', name: 'Petrol' }], tanks: [] })).toEqual([]);
  });
});

describe('standardNozzleLayout', () => {
  const products = [
    { id: 'p-ms', name: 'Petrol', code: 'DEMO-MS-a753c7' },
    { id: 'p-hsd', name: 'Diesel', code: 'HSD-01' },
    { id: 'p-xp', name: 'XP95', code: 'XP' },
  ];
  const tanks = [
    { id: 't-ms', name: 'Tank 1', productId: 'p-ms' },
    { id: 't-hsd', name: 'Tank 2', productId: 'p-hsd' },
  ];
  const row = (name: string, fuel: 'ms' | 'hsd') => ({
    name,
    productId: `p-${fuel}`,
    tankId: `t-${fuel}`,
    currentReading: null,
  });

  it('fills a dual dispenser: one nozzle per fuel with a tank, named after the existing ones', () => {
    expect(standardNozzleLayout({ perFuel: 1, products, tanks, existingNozzles: 3 })).toEqual([
      row('N4', 'hsd'),
      row('N5', 'ms'),
    ]);
  });

  it('fills a quad dispenser: two per fuel', () => {
    expect(standardNozzleLayout({ perFuel: 2, products, tanks, existingNozzles: 0 })).toEqual([
      row('N1', 'hsd'),
      row('N2', 'hsd'),
      row('N3', 'ms'),
      row('N4', 'ms'),
    ]);
  });

  it('skips a fuel with no tank', () => {
    expect(
      standardNozzleLayout({ perFuel: 2, products, tanks: [tanks[1]], existingNozzles: 0 }),
    ).toEqual([row('N1', 'hsd'), row('N2', 'hsd')]);
  });

  it('leaves the opening reading empty rather than inventing one', () => {
    const rows = standardNozzleLayout({ perFuel: 1, products, tanks, existingNozzles: 0 });
    expect(rows.every((r) => r.currentReading === null)).toBe(true);
  });
});
