import { describe, expect, it } from 'vite-plus/test';
import { itcInvoiceCount } from './purchaseGstFigures.js';

describe('itcInvoiceCount', () => {
  it('counts a purchase with several lines once, even with no invoice or document number', () => {
    expect(
      itcInvoiceCount([
        { purchaseId: 'p1' },
        { purchaseId: 'p1' },
        { purchaseId: 'p1' },
        { purchaseId: 'p2' },
      ]),
    ).toBe(2);
  });

  it('counts nothing for no lines', () => {
    expect(itcInvoiceCount([])).toBe(0);
  });
});
