import { describe, expect, it } from 'vitest';
import { dispenserWithNozzlesBody, NOZZLE_SELECTION_MESSAGE } from './dispenserWithNozzles.js';

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
