import { describe, expect, it } from 'vitest';
import type { RecordHandoverResult } from '../../services/cloud.js';
import { cachedStatus, ravisHandover } from './shiftStatus.fixtures.js';
import {
  withAcceptedHandover,
  withCustomerSale,
  withoutCustomerSale,
  type CustomerSaleEntry,
  type ShiftStatusSlice,
} from './shiftStatus.js';

describe('withAcceptedHandover', () => {
  it('records the Drawer from the answer: handover row, readings and reconciliation row', () => {
    const before = cachedStatus();
    const after = withAcceptedHandover(before, ravisHandover);
    const shift = after.activeShift;

    const handover = shift.handovers.find((h) => h.userId === 'u-ravi');
    expect(handover).toMatchObject({
      id: 'h-1',
      userId: 'u-ravi',
      duId: 'du-1',
      cashHandedOver: '10700.00',
      varianceAmount: '-50.00',
      createdAt: '2026-10-15T09:10:00.000Z',
      attendantName: 'Ravi',
      duName: 'DU1',
      terminalEntries: [],
    });
    expect(handover).not.toHaveProperty('attendantId');

    expect(shift.nozzleReadings[0]).toMatchObject({
      closingReading: '1100',
      volumeSold: '100',
      testingVolume: '0',
      nozzleName: 'N1',
    });
    // Another Drawer's reading is untouched.
    expect(shift.nozzleReadings[1]).toBe(before.activeShift.nozzleReadings[1]);

    expect(shift.reconciliation.drawers[0]).toEqual({
      attendantId: 'u-ravi',
      attendantName: 'Ravi',
      duId: 'du-1',
      duName: 'DU1',
      openingFloat: 500,
      cashSales: null,
      cashDrops: 0,
      expectedCash: 10750,
      cashHandedOver: 10700,
      variance: -50,
    });
  });

  it('never writes a figure the answer does not carry: the shift-level totals stay', () => {
    const after = withAcceptedHandover(cachedStatus(), ravisHandover);
    const recon = after.activeShift.reconciliation;
    expect(recon.cashSales).toBe(12614);
    expect(recon.expectedDrawerCash).toBe(13114);
    expect(recon.handoverCashDrops).toBe(0);
  });

  it('replaces a Drawer that handed over before, keeping its labels', () => {
    const replaced: RecordHandoverResult = {
      ...ravisHandover,
      handover: {
        ...ravisHandover.handover,
        id: 'h-2',
        attendantId: 'u-meena',
        duId: 'du-2',
        cashHandedOver: '13000.00',
        varianceAmount: '-114.00',
      },
      nozzleReadings: [],
      varianceAmount: -114,
      expectedCash: 13114,
      replaced: true,
    };
    const after = withAcceptedHandover(cachedStatus(), replaced);
    expect(after.activeShift.handovers).toHaveLength(1);
    expect(after.activeShift.handovers[0]).toMatchObject({
      userId: 'u-meena',
      cashHandedOver: '13000.00',
      varianceAmount: '-114.00',
      attendantName: 'Meena',
    });
    expect(after.activeShift.reconciliation.drawers[1]).toMatchObject({
      cashHandedOver: 13000,
      variance: -114,
    });
  });

  it('drops an older answer that lands after a newer save of the same Drawer', () => {
    const newer = withAcceptedHandover(cachedStatus(), ravisHandover);
    const older: RecordHandoverResult = {
      ...ravisHandover,
      handover: {
        ...ravisHandover.handover,
        cashHandedOver: '9000.00',
        varianceAmount: '-1750.00',
        createdAt: '2026-10-15T09:05:00.000Z',
      },
      nozzleReadings: [{ ...ravisHandover.nozzleReadings[0], closingReading: 1080 }],
    };
    expect(withAcceptedHandover(newer, older)).toBe(newer);
    // The same answer replayed still applies (equal stamp): idempotent.
    expect(withAcceptedHandover(newer, ravisHandover).activeShift.handovers).toEqual(
      newer.activeShift.handovers,
    );
  });

  it('leaves the payload alone when the handover is for another shift', () => {
    const before = cachedStatus();
    const other = { ...ravisHandover, handover: { ...ravisHandover.handover, shiftId: 'shift-0' } };
    expect(withAcceptedHandover(before, other)).toBe(before);
    const idle: ShiftStatusSlice = { activeShift: null };
    expect(withAcceptedHandover(idle, ravisHandover)).toBe(idle);
  });
});

const creditEntry: CustomerSaleEntry = {
  id: 'ct-1',
  shiftId: 'shift-1',
  attendantId: 'u-ravi',
  duId: 'du-1',
  customerId: 'cust-1',
  vehicleId: null,
  productId: 'prod-diesel',
  transactionType: 'Credit Sale',
  amount: '4505.00',
  quantity: '50.000',
  unitPrice: '90.10',
  notes: null,
};
const labels = {
  customerName: 'Kerala Roadways',
  customerType: 'Fleet',
  productName: 'Diesel',
  productCode: 'HSD',
};

describe('withCustomerSale / withoutCustomerSale', () => {
  it('adds the sale to its Drawer, figures as numbers from the answer', () => {
    const after = withCustomerSale(cachedStatus(), creditEntry, labels);
    const ravi = after.activeShift.staffAssignments[0];
    expect(ravi.creditSales).toEqual([
      {
        id: 'ct-1',
        customerId: 'cust-1',
        customerName: 'Kerala Roadways',
        customerType: 'Fleet',
        vehicleId: null,
        productId: 'prod-diesel',
        productName: 'Diesel',
        productCode: 'HSD',
        quantity: 50,
        unitPrice: 90.1,
        amount: 4505,
        notes: null,
      },
    ]);
    // The Drawer total is the server's: it comes with the refetch.
    expect(ravi.creditTotal).toBe(0);
    expect(after.activeShift.staffAssignments[1].creditSales).toEqual([]);
  });

  it('files an OMC card sale under omcSales, on the handover too once it has one', () => {
    const omc = { ...creditEntry, id: 'ct-2', attendantId: 'u-meena', duId: 'du-2' };
    const after = withCustomerSale(
      cachedStatus(),
      { ...omc, transactionType: 'OMC Sale', customerId: null },
      labels,
    );
    expect(after.activeShift.staffAssignments[1].omcSales).toHaveLength(1);
    expect(after.activeShift.handovers[0].omcSales).toHaveLength(1);
    expect(after.activeShift.handovers[0].creditSales).toEqual([]);
  });

  it('is idempotent for a replayed answer and a no-op off the open shift', () => {
    const once = withCustomerSale(cachedStatus(), creditEntry, labels);
    expect(withCustomerSale(once, creditEntry, labels)).toBe(once);
    const before = cachedStatus();
    expect(withCustomerSale(before, { ...creditEntry, shiftId: 'shift-0' }, labels)).toBe(before);
  });

  it('removes a voided sale wherever it is listed', () => {
    const withSale = withCustomerSale(cachedStatus(), creditEntry, labels);
    const after = withoutCustomerSale(withSale, 'shift-1', 'ct-1');
    expect(after.activeShift.staffAssignments[0].creditSales).toEqual([]);
    expect(withoutCustomerSale(after, 'shift-1', 'ct-1')).toBe(after);
  });
});
