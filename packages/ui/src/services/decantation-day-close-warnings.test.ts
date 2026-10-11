import { describe, expect, it } from 'vitest';
import { formatDecantationWarningSummary } from './cloud.js';

describe('formatDecantationWarningSummary', () => {
  it('names unlinked products alongside their Decantation document numbers', () => {
    expect(
      formatDecantationWarningSummary({
        pendingMeasurement: ['DEC-1'],
        purchaseNotLinked: [{ documentNumber: 'DEC-1', products: ['Diesel', 'Petrol'] }],
        flagged: ['DEC-2'],
        unloading: ['DEC-3'],
      }),
    ).toBe(
      'Tanker still unloading — finish or discard: DEC-3; Pending measurement: DEC-1; Purchase not linked: DEC-1 (Diesel, Petrol); Flagged: DEC-2',
    );
  });
});
