// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { AttendantHandoverReport } from '@pump/shared';
import { renderWithProviders } from '../../test/renderWithProviders.js';

/**
 * The attendant statement drawer is where an operator decides whether a
 * shortage conversation is worth having — and whether the export is worth
 * sending. So it must show what the export shows: the days, the shifts inside
 * them, the nozzles in the order a dispenser is walked, and the names behind
 * the fuel-on-credit total.
 */

const report: AttendantHandoverReport = {
  stationId: 'st-1',
  from: '2026-03-01',
  to: '2026-03-02',
  generatedAt: '2026-03-03T06:00:00.000Z',
  attendants: [
    {
      attendantId: 'att-1',
      attendantName: 'Ravi',
      shiftsWorked: 2,
      handoverCount: 2,
      totals: {
        cashHandedOver: 2000,
        cardHandedOver: 400,
        upiHandedOver: 600,
        creditHandedOver: 200,
        expectedFuelSales: 3300,
        billedSales: 0,
        handoverProductSales: 0,
        creditSales: 1000,
        varianceAmount: -50,
      },
      shifts: [
        {
          shiftId: 'sh-1',
          businessDate: '2026-03-01',
          shiftTemplateName: 'Morning',
          closedAt: '2026-03-01T14:00:00.000Z',
          dispensers: [
            {
              handoverId: 'h-1',
              duId: 'du-1',
              duName: 'DU 1',
              cashHandedOver: 1000,
              cardHandedOver: 200,
              upiHandedOver: 300,
              creditHandedOver: 100,
              expectedFuelSales: 1650,
              creditSales: 800,
              varianceAmount: -50,
              testingVolume: 5,
              terminals: [],
              // Composed order: N2 before N10, which is how the dispenser is walked.
              nozzles: [
                {
                  nozzleId: 'nz-2',
                  nozzleName: 'N2',
                  productName: 'Petrol',
                  openingReading: 100,
                  closingReading: 200,
                  volumeSold: 100,
                  testingVolume: 2,
                  unitPrice: 105,
                },
                {
                  nozzleId: 'nz-10',
                  nozzleName: 'N10',
                  productName: 'Diesel',
                  openingReading: 300,
                  closingReading: 380,
                  volumeSold: 80,
                  testingVolume: 3,
                  unitPrice: 92,
                },
              ],
            },
          ],
          cashHandedOver: 1000,
          cardHandedOver: 200,
          upiHandedOver: 300,
          creditHandedOver: 100,
          expectedFuelSales: 1650,
          billedSales: 0,
          handoverProductSales: 0,
          creditSales: 1000,
          creditSaleLines: [
            {
              transactionId: 'ct-1',
              customerId: 'cust-1',
              customerName: 'Anand Transports',
              vehicleRegistration: 'KL-07-AB-1234',
              productName: 'Diesel',
              quantity: 20,
              unitPrice: 40,
              amount: 800,
            },
            {
              transactionId: 'ct-2',
              customerId: 'cust-2',
              customerName: 'Zenith Logistics',
              vehicleRegistration: null,
              productName: null,
              quantity: null,
              unitPrice: null,
              amount: 200,
            },
          ],
          varianceAmount: -50,
          testingVolume: 5,
        },
        {
          shiftId: 'sh-2',
          businessDate: '2026-03-02',
          shiftTemplateName: 'Night',
          closedAt: '2026-03-02T22:00:00.000Z',
          dispensers: [],
          cashHandedOver: 1000,
          cardHandedOver: 200,
          upiHandedOver: 300,
          creditHandedOver: 100,
          expectedFuelSales: 1650,
          billedSales: 0,
          handoverProductSales: 0,
          creditSales: 0,
          creditSaleLines: [],
          varianceAmount: 0,
          testingVolume: 0,
        },
      ],
    },
  ],
};

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAttendantHandoverReport: () => ({ data: report, isLoading: false, error: null }),
}));

// The capability gate is a separate axis, covered by its own tests; here the
// Organization holds the grant so the report itself is what is under test.
vi.mock('../../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CapabilityRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { AttendantHandoverReportPanel } = await import('./AttendantHandoverReportPanel.js');

function openDrawer() {
  renderWithProviders(
    <AttendantHandoverReportPanel selectedStation={{ id: 'st-1', name: 'Apex Station' }} />,
  );
  // The attendant's row in the summary table, not the option in the filter.
  fireEvent.click(screen.getAllByRole('cell', { name: 'Ravi' })[0]);
}

describe('AttendantHandoverReportPanel drawer', () => {
  afterEach(cleanup);

  it('groups the shifts under the business day they belong to', () => {
    openDrawer();

    const dates = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(dates).toEqual(['2026-03-01', '2026-03-02']);
    expect(screen.getByText('Morning')).toBeTruthy();
    expect(screen.getByText('Night')).toBeTruthy();
  });

  it('names who owes the shift\u2019s fuel-on-credit, and totals to the shift figure', () => {
    openDrawer();

    // Tables in drawer order: summary, the shift's nozzles, its credit chits.
    const creditTable = screen.getAllByRole('table')[2];
    const rows = within(creditTable)
      .getAllByRole('row')
      .map((r) =>
        within(r)
          .queryAllByRole('cell')
          .map((c) => c.textContent),
      )
      .filter((cells) => cells.length > 0);

    expect(rows[0]).toEqual(['Anand Transports', 'KL-07-AB-1234', 'Diesel', '20', '₹800.00']);
    // A chit that recorded no product or vehicle is still listed, still counted.
    expect(rows[1]).toEqual(['Zenith Logistics', '—', '—', '—', '₹200.00']);
    expect(rows[2]).toEqual(['Total', '', '', '', '₹1,000.00']);
  });

  it('lists the nozzles in the order the dispenser is walked', () => {
    openDrawer();

    const nozzleTable = screen.getAllByRole('table')[1];
    const names = within(nozzleTable)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent);

    // Composed order is preserved — N10 after N2, not lexicographic.
    expect(names).toEqual(['N2', 'N10']);
  });

  it('opens on the range figures an export would carry', () => {
    openDrawer();

    // The KPI header the PDF's cover page carries, in the same terms.
    for (const label of ['Shifts', 'Cash handed over', 'Card + UPI', 'Net variance']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Fuel-on-credit appears twice: the range KPI and the shift's breakdown head.
    expect(screen.getAllByText('Fuel-on-credit').length).toBeGreaterThan(1);
  });
});
