import React from 'react';
import { outputReactPdf, type PdfOutput } from '../../../services/exportPdf.js';
import {
  letterheadFromStation,
  showLogoFromStation,
} from '../../../services/reports/letterhead.js';
import { paperFromStation } from '../../../services/reports/reportConfig.js';
import { ledgerFileName } from '../../../services/reports/ledgerFileName.js';
import { formatDateSpan } from '../../../utils/format.js';
import type { CashBankSummary } from './cashBankSummary.js';

/**
 * Print or save the Cash & bank summary (#531) through the PDF path, so Print
 * works on desktop too. The react-pdf document loads only when asked for.
 */
export async function generateCashBankPdf(
  station: any,
  summary: CashBankSummary,
  range: { from: string; to: string },
  output: PdfOutput = 'save',
): Promise<void> {
  const { CashBankDoc } = await import('../../../services/reports/cashBankDoc.js');
  await outputReactPdf(
    React.createElement(CashBankDoc, {
      summary,
      periodLabel: formatDateSpan(range.from, range.to),
      stationName: station?.name,
      letterhead: letterheadFromStation(station),
      showLogo: showLogoFromStation(station),
      paper: paperFromStation(station),
      generatedAt: new Date().toISOString(),
    }),
    ledgerFileName('CashBank', station?.name, range, 'Station'),
    output,
  );
}
