import { describe, expect, it } from 'vitest';
import { emptyDecantationForm, emptyLine } from './decantationForm.js';
import { reviewDecantation } from './decantationReview.js';

const tanks = [
  { id: 't1', productId: 'p-hsd' },
  { id: 't2', productId: 'p-hsd' },
  { id: 't3', productId: 'p-ms' },
];
const invoices = { 'p-hsd': 12000, 'p-ms': 4000 };

describe('reviewDecantation', () => {
  it('received = after − before + sales, per line; variance per invoice from all its lines', () => {
    const v = emptyDecantationForm('2026-10-11');
    v.lines = [
      {
        ...emptyLine('t1'),
        beforeDip: '1000',
        doAfterDip: true,
        afterDip: '7000',
        salesDuring: '20',
      },
      { ...emptyLine('t2'), beforeDip: '500', doAfterDip: true, afterDip: '6400' },
    ];
    v.links = { 'p-hsd': 'x' };
    const r = reviewDecantation(v, tanks, invoices, 0.2);
    expect(r.lines.map((l) => l.received)).toEqual([6020, 5900]);
    expect(r.invoices).toEqual([
      {
        productId: 'p-hsd',
        invoiceQty: 12000,
        received: 11920,
        variance: -80,
        outOfTolerance: true,
      },
    ]);
    expect(r.unlinkedProductIds).toEqual([]);
  });

  it('keeps the invoice pending while any of its lines is unmeasured', () => {
    const v = emptyDecantationForm('2026-10-11');
    v.lines = [
      { ...emptyLine('t1'), beforeDip: '1000', doAfterDip: true, afterDip: '7000' },
      { ...emptyLine('t2'), beforeDip: '500' },
      { ...emptyLine('t3'), beforeDip: '10' },
    ];
    v.links = { 'p-hsd': 'x' };
    const r = reviewDecantation(v, tanks, invoices, 0.2);
    expect(r.invoices[0]).toMatchObject({ received: null, variance: null, outOfTolerance: false });
    expect(r.unlinkedProductIds).toEqual(['p-ms']);
    expect(r.lines[1].received).toBeNull();
  });
});
