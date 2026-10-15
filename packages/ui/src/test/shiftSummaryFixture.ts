import type { ShiftSummaryRecord } from '../components/Shifts/shiftSummaryModel.js';

/**
 * Stored Shift Summaries that touch every section the screen and the PDF print.
 * The Shift Summary parity test reads each one on screen and in the PDF (#595).
 */

const nozzle = (
  name: string,
  product: [string, string | null],
  unit: string,
  opening: number,
  gross: number,
  testing: number,
  net?: number,
) => ({
  nozzleId: name,
  nozzleName: name,
  productName: product[0],
  productCode: product[1],
  unit,
  openingReading: opening,
  closingReading: opening + gross,
  volumeSold: gross,
  testingVolume: testing,
  ...(net != null && { netVolume: net }),
});

const MS: [string, string] = ['Petrol', 'MS'];
const HSD: [string, string] = ['Diesel', 'HSD'];
const CNG: [string, null] = ['CNG', null];

const drawer = (
  attendantName: string,
  duName: string,
  f: { float: number; sales: number; drops: number; close?: number; handed: number },
) => {
  const expectedCash = f.float + f.sales - f.drops - (f.close ?? 0);
  return {
    attendantId: attendantName,
    attendantName,
    duName,
    openingFloat: f.float,
    cashSales: f.sales,
    cashDrops: f.drops,
    closeCashDrops: f.close ?? 0,
    expectedCash,
    cashHandedOver: f.handed,
    variance: Math.round((f.handed - expectedCash) * 100) / 100,
  };
};

/** A full two-level shift in litres: a shortage, a surplus, card/UPI, credit, drops, a warning. */
export const SHIFT_FULL_FIXTURE: ShiftSummaryRecord = {
  shiftId: 'shift-full',
  status: 'CLOSED',
  businessDate: '2026-10-08',
  shiftSequence: 1,
  generatedAt: '2026-10-08T08:35:00.000Z',
  snapshotData: {
    shiftId: 'shift-full',
    templateName: 'Morning',
    openedAt: '2026-10-08T00:30:00.000Z',
    closedAt: '2026-10-08T08:30:00.000Z',
    generatedAt: '2026-10-08T08:35:00.000Z',
    closedByName: 'Anita Manager',
    cashVarianceModel: 2,
    warnings: ['Nozzle N3 closed with no sale'],
    nozzleReadings: [
      nozzle('N1', MS, 'L', 120450.125, 812.456, 5, 807.456),
      nozzle('N2', HSD, 'L', 98000.5, 1204.3, 5, 1199.3),
      nozzle('N3', HSD, 'L', 5000, 0, 0, 0),
    ],
    totalVolumeSold: 2016.756,
    totalTestingVolume: 10,
    totalNetVolumeSold: 2006.756,
    fuelByProduct: [
      {
        productName: 'Petrol',
        productCode: 'MS',
        unit: 'L',
        grossVolume: 812.456,
        testingVolume: 5,
        netVolume: 807.456,
        salesValue: 82341.25,
      },
      {
        productName: 'Diesel',
        productCode: 'HSD',
        unit: 'L',
        grossVolume: 1204.3,
        testingVolume: 5,
        netVolume: 1199.3,
        salesValue: 107000.5,
      },
    ],
    totalFuelSalesValue: 189341.75,
    handovers: [
      {
        id: 'h1',
        attendantName: 'Ravi',
        duCode: 'DU1',
        cashHandedOver: 60000,
        cardHandedOver: 12000.25,
        upiHandedOver: 8000.1,
        creditHandedOver: 2340.9,
        expectedSales: 82341.25,
        varianceAmount: -340,
      },
      {
        id: 'h2',
        attendantName: 'Suresh',
        duCode: 'DU2',
        cashHandedOver: 80000,
        cardHandedOver: 15000,
        upiHandedOver: 10000.5,
        creditHandedOver: 2000,
        expectedSales: 107000.5,
        varianceAmount: 0,
      },
    ],
    terminalBreakdown: [
      {
        terminalId: 't1',
        terminalLabel: 'POS 1',
        provider: 'Pine Labs',
        card: 27000.25,
        upi: 0,
        entries: [
          { attendantName: 'Ravi', duCode: 'DU1', card: 12000.25, upi: 0 },
          { attendantName: 'Suresh', duCode: 'DU2', card: 15000, upi: 0 },
        ],
      },
      {
        terminalId: 't2',
        terminalLabel: 'UPI QR',
        provider: null,
        card: 0,
        upi: 18000.6,
        entries: [
          { attendantName: 'Ravi', duCode: 'DU1', card: 0, upi: 8000.1 },
          { attendantName: 'Suresh', duCode: 'DU2', card: 0, upi: 10000.5 },
        ],
      },
    ],
    creditSales: [
      {
        id: 'c1',
        customerName: 'Fleet Co',
        vehicleNumber: 'KL-07-AB-1234',
        productName: 'Diesel',
        quantity: 22.125,
        unit: 'L',
        notes: 'Trip 42',
        amount: 2340.9,
      },
      {
        id: 'c2',
        customerName: 'City Taxi',
        vehicleNumber: null,
        productName: null,
        quantity: null,
        notes: null,
        amount: 2000,
      },
    ],
    creditSalesTotal: 4340.9,
    openingCash: 4000,
    cashSalesSum: 140000,
    handoverCashDrops: 50000,
    closeCashDrops: 1500,
    expectedCash: 88500,
    closingCash: 88300,
    attendantVariance: -340,
    cashVariance: -200,
    drawers: [
      drawer('Ravi', 'DU1', { float: 2000, sales: 60000, drops: 20000, handed: 41660 }),
      drawer('Suresh', 'DU2', {
        float: 2000,
        sales: 80000,
        drops: 30000,
        close: 1500,
        handed: 50500,
      }),
    ],
  },
};

/** Litres and kg on one shift: every volume total reads `—`, with a note. */
export const SHIFT_MIXED_UNIT_FIXTURE: ShiftSummaryRecord = {
  shiftId: 'shift-mixed',
  status: 'LOCKED',
  businessDate: '2026-10-08',
  shiftSequence: 2,
  generatedAt: '2026-10-08T16:35:00.000Z',
  snapshotData: {
    shiftId: 'shift-mixed',
    templateName: 'Evening',
    generatedAt: '2026-10-08T16:35:00.000Z',
    openedAt: '2026-10-08T08:30:00.000Z',
    closedAt: '2026-10-08T16:30:00.000Z',
    closedByName: 'Anita Manager',
    cashVarianceModel: 2,
    nozzleReadings: [
      nozzle('N1', MS, 'L', 121262.581, 500.5, 0, 500.5),
      nozzle('C1', CNG, 'kg', 3400.25, 210.75, 0, 210.75),
    ],
    // What an older server stored: L and kg added together. Never printed.
    totalVolumeSold: 711.25,
    totalTestingVolume: 0,
    totalNetVolumeSold: 711.25,
    fuelByProduct: [
      {
        productName: 'Petrol',
        productCode: 'MS',
        unit: 'L',
        grossVolume: 500.5,
        testingVolume: 0,
        netVolume: 500.5,
        salesValue: 50725.5,
      },
      {
        productName: 'CNG',
        unit: 'kg',
        grossVolume: 210.75,
        testingVolume: 0,
        netVolume: 210.75,
        salesValue: 18545.99,
      },
    ],
    totalFuelSalesValue: 69271.49,
    handovers: [
      {
        id: 'h3',
        attendantName: 'Meera',
        duCode: 'DU1',
        cashHandedOver: 69500,
        cardHandedOver: 0,
        upiHandedOver: 0,
        creditHandedOver: 0,
        expectedSales: 69271.49,
        varianceAmount: 228.51,
      },
    ],
    openingCash: 2000,
    cashSalesSum: 69500,
    handoverCashDrops: 0,
    closeCashDrops: 0,
    expectedCash: 71500,
    closingCash: 71500,
    attendantVariance: 228.51,
    cashVariance: 0,
    drawers: [drawer('Meera', 'DU1', { float: 2000, sales: 67271.49, drops: 0, handed: 69500 })],
  },
};

/** A snapshot without the stored totals: they stay blank, and the notes say why. */
export const SHIFT_NOT_STORED_FIXTURE: ShiftSummaryRecord = {
  shiftId: 'shift-partial',
  status: 'CLOSED',
  businessDate: '2026-10-07',
  shiftSequence: 1,
  snapshotData: {
    shiftId: 'shift-partial',
    templateName: 'Day',
    openedAt: '2026-10-07T00:30:00.000Z',
    closedAt: '2026-10-07T12:30:00.000Z',
    closedByName: 'Anita Manager',
    cashVarianceModel: 2,
    nozzleReadings: [nozzle('N1', MS, 'L', 1000, 100.255, 2), nozzle('N2', MS, 'L', 2000, 50, 0)],
    totalVolumeSold: 150.255,
    fuelByProduct: [
      {
        productName: 'Petrol',
        productCode: 'MS',
        unit: 'L',
        grossVolume: 150.255,
        testingVolume: 2,
        netVolume: 148.255,
        salesValue: 15119.5,
      },
    ],
    creditSales: [
      {
        id: 'c3',
        customerName: 'Fleet Co',
        vehicleNumber: 'KL-07-CD-9',
        productName: 'Petrol',
        quantity: 10,
        unit: 'L',
        amount: 1020,
      },
    ],
    openingCash: 1000,
    cashSalesSum: 14099.5,
    expectedCash: 15099.5,
    closingCash: 15099.5,
    attendantVariance: 0,
    cashVariance: 0,
  },
};

/** A shift closed before two-level variance (#287) that stored its purchases (#308). */
export const SHIFT_LEGACY_FIXTURE: ShiftSummaryRecord = {
  shiftId: 'shift-legacy',
  status: 'LOCKED',
  businessDate: '2025-03-01',
  shiftSequence: null,
  snapshotData: {
    shiftId: 'shift-legacy',
    templateName: 'Morning',
    openedAt: '2025-03-01T00:30:00.000Z',
    closedAt: '2025-03-01T08:30:00.000Z',
    closedByName: 'Old Owner',
    nozzleReadings: [nozzle('N1', HSD, 'L', 500, 300, 0)],
    totalVolumeSold: 300,
    totalTestingVolume: 0,
    totalNetVolumeSold: 300,
    handovers: [],
    openingCash: 5000,
    cashSalesSum: 26700,
    cashDrops: 10000,
    expectedCash: 21700,
    closingCash: 21550,
    cashVariance: -150,
    purchases: [
      {
        supplierName: 'IOCL Depot',
        documentNumber: 'PUR-7',
        invoiceNumber: 'INV-99',
        notes: 'Tanker 2',
        amount: 450000,
      },
      { supplierName: null, documentNumber: 'PUR-8', amount: 1200.5 },
    ],
  },
};

export const SHIFT_SUMMARY_FIXTURES: Record<string, ShiftSummaryRecord> = {
  'a full shift': SHIFT_FULL_FIXTURE,
  'a mixed-unit shift': SHIFT_MIXED_UNIT_FIXTURE,
  'a shift without stored totals': SHIFT_NOT_STORED_FIXTURE,
  'a legacy snapshot with purchases': SHIFT_LEGACY_FIXTURE,
};
