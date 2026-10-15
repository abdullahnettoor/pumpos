import { describe, expect, it } from 'vitest';
import type { DecantationView } from '@pump/shared';
import { decantationTotal, toDecantationRow } from './decantationRows.js';

const names = {
  tanks: { 't-1': 'Tank 1', 't-2': 'Tank 2', 't-3': 'Tank 3' },
  products: { 'p-ms': 'MS', 'p-hsd': 'HSD' },
};

const line = (over: Partial<DecantationView['lines'][number]>) => ({
  id: 'l',
  tankId: 't-1',
  productId: 'p-hsd',
  beforeDip: 1000,
  beforeDipAt: null,
  observedDensity: null,
  observedTempC: null,
  roDensity: null,
  afterDip: null,
  afterDipAt: null,
  salesDuring: 0,
  receivedQty: null,
  status: 'PENDING_MEASUREMENT' as const,
  ...over,
});

const visit = (over: Partial<DecantationView>): DecantationView => ({
  id: 'd',
  stationId: 's',
  businessDayId: 'bd',
  businessDate: '2026-10-11',
  documentNumber: 'DEC-1',
  tankerNumber: 'KL-1',
  driverName: null,
  unloadStartedAt: null,
  unloadEndedAt: null,
  chambersChecked: false,
  status: 'PENDING_MEASUREMENT',
  flags: [],
  notes: null,
  createdAt: '',
  updatedAt: '',
  lines: [],
  chambers: [],
  ...over,
});

describe('toDecantationRow', () => {
  it('groups tank lines under one tanker visit with their products', () => {
    const r = toDecantationRow(
      visit({
        lines: [
          line({ id: 'a', tankId: 't-1', productId: 'p-ms' }),
          line({ id: 'b', tankId: 't-2', productId: 'p-hsd' }),
          line({ id: 'c', tankId: 't-3', productId: 'p-hsd' }),
        ],
      }),
      names,
      0.2,
    );
    expect(r.tanks.map((t) => t.tankName)).toEqual(['Tank 1', 'Tank 2', 'Tank 3']);
    expect(r.productNames).toEqual(['MS', 'HSD']);
    expect(r.unlinked).toEqual(['MS', 'HSD']);
    expect(r.invoiceQty).toBeNull();
    expect(r.receivedQty).toBeNull();
  });

  it('shows Excess / Short per invoice against the quantity tolerance and density status', () => {
    const r = toDecantationRow(
      visit({
        status: 'MEASURED',
        flags: [{ code: 'DENSITY_OUT_OF_TOLERANCE', tankLineId: 'a', message: 'off' }],
        lines: [
          line({
            id: 'a',
            productId: 'p-hsd',
            roDensity: 834,
            receivedQty: 5900,
            status: 'MEASURED',
          }),
          line({
            id: 'b',
            tankId: 't-2',
            productId: 'p-hsd',
            roDensity: 834,
            receivedQty: 6010,
            status: 'MEASURED',
          }),
          line({
            id: 'c',
            tankId: 't-3',
            productId: 'p-ms',
            receivedQty: 3000,
            status: 'MEASURED',
          }),
        ],
        links: [
          {
            productId: 'p-hsd',
            purchaseId: 'x',
            invoiceNumber: 'I1',
            supplierName: null,
            invoiceQty: 12000,
            invoiceDensity: 830,
            receivedQty: 11910,
            varianceQty: -90,
            varianceComputedAt: 'now',
          },
          {
            productId: 'p-ms',
            purchaseId: 'y',
            invoiceNumber: 'I2',
            supplierName: null,
            invoiceQty: 3000,
            invoiceDensity: null,
            receivedQty: 3000,
            varianceQty: 0,
            varianceComputedAt: 'now',
          },
        ],
      }),
      names,
      0.2,
    );
    expect(r.invoiceQty).toBe(15000);
    expect(r.receivedQty).toBe(14910);
    expect(r.variances).toEqual([
      { productName: 'HSD', state: 'short', qty: -90 },
      { productName: 'MS', state: 'tanker-matches', qty: 0 },
    ]);
    expect(r.density).toEqual([
      { productName: 'HSD', diff: 4, invoiceDensity: 830, roDensity: 834, outOfTolerance: true },
    ]);
    expect(r.unlinked).toEqual([]);
  });

  it('keeps received empty while any line waits for measurement and uses the server unlinked list', () => {
    const r = toDecantationRow(
      visit({
        lines: [
          line({ id: 'a', receivedQty: 100, status: 'MEASURED' }),
          line({ id: 'b', tankId: 't-2' }),
        ],
        unlinkedProductIds: ['p-hsd'],
      }),
      names,
      0.2,
    );
    expect(r.receivedQty).toBeNull();
    expect(r.unlinked).toEqual(['HSD']);
  });
});

describe('decantationTotal', () => {
  const link = (productId: string, invoiceQty: number, receivedQty: number | null) => ({
    productId,
    purchaseId: productId,
    invoiceNumber: 'I',
    supplierName: null,
    invoiceQty,
    invoiceDensity: null,
    receivedQty,
    varianceQty: receivedQty == null ? null : receivedQty - invoiceQty,
    varianceComputedAt: receivedQty == null ? null : 'now',
  });
  const measured = (productId: string) =>
    line({ id: productId, productId, status: 'MEASURED', receivedQty: 1 });

  it('sums only lines with both an invoice and a receipt, so the columns compare', () => {
    const rows = [
      // Measured, both products linked: counts.
      visit({
        status: 'MEASURED',
        lines: [measured('p-ms'), measured('p-hsd')],
        links: [link('p-ms', 3000, 2990), link('p-hsd', 6000, 6010)],
        unlinkedProductIds: [],
      }),
    ].map((v) => toDecantationRow(v, names, 0.2));
    expect(decantationTotal(rows)).toEqual({
      label: 'Total',
      invoiceQty: 9000,
      receivedQty: 9000,
    });
  });

  it('leaves out a measured product with no purchase from both columns, and says so', () => {
    const rows = [
      visit({
        status: 'MEASURED',
        lines: [measured('p-ms'), measured('p-hsd')],
        links: [link('p-hsd', 6000, 5900)],
        unlinkedProductIds: ['p-ms'],
      }),
      // Linked but still waiting for its after-dip.
      visit({ lines: [line({ id: 'x' })], links: [link('p-hsd', 12000, null)] }),
    ].map((v) => toDecantationRow(v, names, 0.2));
    expect(decantationTotal(rows)).toEqual({
      label: 'Total excl. pending and unlinked',
      invoiceQty: 6000,
      receivedQty: 5900,
    });
  });
});
