/**
 * One sealed DSR row that touches every section the screen and the PDF print:
 * a mixed-unit fuel day (litres and kg), a shortage, a surplus and a balanced
 * stock line, a shift closed before two-level variance (#287), GST and VAT.
 * The DSR parity test reads it on screen and in the PDF.
 */
export const DSSR_PARITY_FIXTURE = {
  businessDate: '2026-10-08',
  generatedAt: '2026-10-08T22:00:00.000Z',
  snapshotData: {
    shiftsIncluded: 2,
    pnl: {
      revenue: 412345.5,
      revenueFuel: 398000.25,
      revenueMerch: 14345.25,
      cogs: 381200,
      cogsFuel: 370100,
      cogsMerch: 11100,
      grossMargin: 31145.5,
    },
    credit: { normalCredit: 12500, fleetCredit: 34040 },
    merchandise: { salesValue: 14345.25 },
    purchases: { total: 52000 },
    omcCard: { total: 2000, count: 1 },
    salesTax: {
      gst: { total: 2188.26, taxable: 12156.99, cgst: 1094.13, sgst: 1094.13, igst: 0 },
      vat: { vat: 66333.38 },
    },
    fuel: {
      totalGrossVolume: 4310.456,
      totalTestingVolume: 10,
      totalNetVolume: 4300.456,
      totalSalesValue: 398000.25,
      byProduct: [
        {
          productName: 'Petrol',
          productCode: 'MS',
          unit: 'L',
          grossVolume: 2405.125,
          testingVolume: 5,
          netVolume: 2400.125,
          salesValue: 245000.25,
        },
        {
          productName: 'Diesel',
          productCode: 'HSD',
          unit: 'L',
          grossVolume: 1605.331,
          testingVolume: 5,
          netVolume: 1600.331,
          salesValue: 143000,
        },
        {
          productName: 'CNG',
          unit: 'kg',
          grossVolume: 300,
          testingVolume: 0,
          netVolume: 300,
          salesValue: 10000,
        },
      ],
      nozzles: [
        {
          nozzleName: 'N1',
          productName: 'Petrol',
          unit: 'L',
          grossVolume: 2405.125,
          testingVolume: 5,
          netVolume: 2400.125,
        },
        {
          nozzleName: 'N2',
          productName: 'Diesel',
          unit: 'L',
          grossVolume: 1605.331,
          testingVolume: 5,
          netVolume: 1600.331,
        },
        {
          nozzleName: 'C1',
          productName: 'CNG',
          unit: 'kg',
          grossVolume: 300,
          testingVolume: 0,
          netVolume: 300,
        },
      ],
    },
    fuelStockVariance: [
      {
        tankName: 'Tank 1',
        productName: 'Petrol',
        unit: 'L',
        expectedQuantity: 8000.5,
        actualQuantity: 7988.25,
        varianceQuantity: -12.25,
        status: 'Loss',
      },
      {
        tankName: 'Tank 2',
        productName: 'Diesel',
        unit: 'L',
        expectedQuantity: 6000,
        actualQuantity: 6004.5,
        varianceQuantity: 4.5,
        status: 'Gain',
      },
    ],
    merchandiseStockVariance: [
      {
        productName: 'Engine Oil 1L',
        unit: 'Nos',
        expectedQuantity: 40,
        actualQuantity: 40,
        varianceQuantity: 0,
        status: 'OK',
      },
      {
        productName: 'Coolant 500ml',
        unit: 'Nos',
        expectedQuantity: 25,
        actualQuantity: 23,
        varianceQuantity: -2,
        status: 'Loss',
      },
    ],
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Morning',
        closedAt: '2026-10-08T08:30:00.000Z',
        netVolume: 2150.25,
        cashVariance: -150,
        attendantVariance: -100,
      },
      {
        shiftId: 's2',
        shiftSequence: 2,
        templateName: 'Evening',
        closedAt: '2026-10-08T16:30:00.000Z',
        netVolume: 2150.206,
        cashVariance: 75.5,
        attendantVariance: null,
      },
    ],
    drawer: {
      totalCashVariance: -74.5,
      totalAttendantVariance: -100,
      attendants: [
        { attendantName: 'Ravi', duName: 'DU 1', variance: -100 },
        { attendantName: 'Anil', duName: 'DU 2', variance: 0 },
      ],
    },
  },
};

/**
 * A sealed DSR for a day with nothing on it: no fuel, no nozzles, no shifts.
 * The screen and the PDF both print the empty sections with the same text.
 */
export const DSSR_EMPTY_DAY_FIXTURE = {
  businessDate: '2026-10-09',
  generatedAt: '2026-10-09T22:00:00.000Z',
  snapshotData: {
    shiftsIncluded: 0,
    pnl: {},
    fuel: { byProduct: [], nozzles: [] },
    fuelStockVariance: [],
    merchandiseStockVariance: [],
    shifts: [],
    drawer: { attendants: [] },
  },
};

/**
 * A kg-only day whose snapshot stores no net volume and no drawer totals
 * (an older or partial snapshot). Its totals stay blank, never derived, and
 * the labels say why, alike on the screen and in the PDF.
 */
export const DSSR_NOT_STORED_FIXTURE = {
  businessDate: '2026-10-10',
  generatedAt: '2026-10-10T22:00:00.000Z',
  snapshotData: {
    shiftsIncluded: 1,
    fuel: {
      totalGrossVolume: 310,
      totalTestingVolume: 10,
      totalSalesValue: 25000,
      byProduct: [
        {
          productName: 'CNG',
          unit: 'kg',
          grossVolume: 310,
          testingVolume: 10,
          netVolume: 300,
          salesValue: 25000,
        },
      ],
      nozzles: [],
    },
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Day',
        closedAt: '2026-10-10T12:00:00.000Z',
        netVolume: 300,
        cashVariance: -20,
        attendantVariance: -20,
      },
    ],
    drawer: { attendants: [{ attendantName: 'Ravi', duName: 'DU 1', variance: -20 }] },
  },
};
