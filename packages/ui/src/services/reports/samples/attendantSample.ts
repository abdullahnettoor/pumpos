import type { AttendantStatementData } from '../attendantStatementData.js';

/**
 * One attendant's single-day statement that touches every section the
 * Attendant Handover Report prints: two dispensers with nozzle readings and a
 * terminal, a credit chit, product sales and a shortage. The report template
 * preview (#605) prints it.
 */
export const ATTENDANT_STATEMENT_SAMPLE: AttendantStatementData = {
  attendantId: 'att-ravi',
  attendantName: 'Ravi Kumar',
  shiftsWorked: 1,
  handoverCount: 2,
  from: '2026-10-08',
  to: '2026-10-08',
  generatedAt: '2026-10-08T22:00:00.000Z',
  totals: {
    cashHandedOver: 48200,
    cardHandedOver: 6200,
    upiHandedOver: 9450,
    creditHandedOver: 4100,
    expectedFuelSales: 67450,
    billedSales: 840,
    handoverProductSales: 420,
    creditSales: 4100,
    varianceAmount: -50,
  },
  shifts: [
    {
      shiftId: 'shift-sample',
      businessDate: '2026-10-08',
      shiftSequence: 1,
      shiftTemplateName: 'Morning',
      closedAt: '2026-10-08T08:35:00.000Z',
      cashHandedOver: 48200,
      cardHandedOver: 6200,
      upiHandedOver: 9450,
      creditHandedOver: 4100,
      expectedFuelSales: 67450,
      billedSales: 840,
      handoverProductSales: 420,
      creditSales: 4100,
      varianceAmount: -50,
      testingVolume: 10,
      creditSaleLines: [
        {
          transactionId: 'ct-1',
          customerId: 'cust-1',
          customerName: 'Kerala Roadways',
          vehicleRegistration: 'KL-07-AB-1234',
          productName: 'Diesel',
          quantity: 43.5,
          unit: 'L',
          unitPrice: 94.25,
          amount: 4100,
        },
      ],
      dispensers: [
        {
          handoverId: 'ho-1',
          duId: 'du-1',
          duName: 'DU 1',
          cashHandedOver: 30100,
          cardHandedOver: 6200,
          upiHandedOver: 4200,
          creditHandedOver: 0,
          expectedFuelSales: 40550,
          creditSales: 0,
          varianceAmount: -50,
          testingVolume: 5,
          terminals: [
            {
              terminalId: 'pos-1',
              terminalName: 'POS 1',
              cardAmount: 6200,
              upiAmount: 4200,
              batchRef: 'B-1042',
            },
          ],
          nozzles: [
            {
              nozzleId: 'n-1',
              nozzleName: 'N1',
              productName: 'Petrol',
              openingReading: 182340.125,
              closingReading: 182740.125,
              volumeSold: 400,
              testingVolume: 5,
              unitPrice: 102.5,
            },
          ],
        },
        {
          handoverId: 'ho-2',
          duId: 'du-2',
          duName: 'DU 2',
          cashHandedOver: 18100,
          cardHandedOver: 0,
          upiHandedOver: 5250,
          creditHandedOver: 4100,
          expectedFuelSales: 26900,
          creditSales: 4100,
          varianceAmount: 0,
          testingVolume: 5,
          terminals: [],
          nozzles: [
            {
              nozzleId: 'n-2',
              nozzleName: 'N2',
              productName: 'Diesel',
              openingReading: 95410.5,
              closingReading: 95700.5,
              volumeSold: 290,
              testingVolume: 5,
              unitPrice: 94.25,
            },
          ],
        },
      ],
    },
  ],
};
