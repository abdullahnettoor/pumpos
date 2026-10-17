import type { AttendantReportEntry } from '@pump/shared';
import { sumRupees } from '../../../utils/ledgerWindow.js';

/**
 * The totals Reports panels print, worked out here rather than in the
 * components: pure, and summed in whole paise so a total is the sum of the
 * figures shown (#531).
 */

type Figure = number | string | null | undefined;

/** The rows of the sales tax register that carry a tax figure. */
export interface SalesTaxFigures {
  taxCategory?: string | null;
  cgst?: Figure;
  sgst?: Figure;
  igst?: Figure;
  cess?: Figure;
  vat?: Figure;
}

/**
 * GST › Sales: output GST on merchandise (CGST + SGST + IGST + cess of the GST
 * lines) and output VAT on fuel (the FUEL_VAT lines). Other lines add nothing.
 */
export function salesTaxTotals(rows: readonly SalesTaxFigures[]): {
  gstOutput: number;
  vat: number;
} {
  const gst = rows.filter((r) => r.taxCategory === 'GST');
  const vat = rows.filter((r) => r.taxCategory === 'FUEL_VAT');
  return {
    gstOutput: sumRupees(gst.flatMap((r) => [r.cgst, r.sgst, r.igst, r.cess])),
    vat: sumRupees(vat.map((r) => r.vat)),
  };
}

/**
 * Attendant handovers: the net cash variance of the attendants listed and the
 * shifts they closed. The net is for the tile; the table does not add
 * variances up (one attendant's surplus does not cover another's shortage).
 */
export function attendantTotals(
  attendants: readonly Pick<AttendantReportEntry, 'shiftsWorked' | 'totals'>[],
): { variance: number; shifts: number } {
  return {
    variance: sumRupees(attendants.map((a) => a.totals.varianceAmount)),
    shifts: attendants.reduce((n, a) => n + (Number(a.shiftsWorked) || 0), 0),
  };
}
