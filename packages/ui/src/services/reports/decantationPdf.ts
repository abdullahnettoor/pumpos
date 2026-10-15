import React from 'react';
import type { DecantationReport } from '@pump/shared';
import { outputReactPdf, type PdfOutput } from '../exportPdf.js';
import { paperFromStation } from './reportConfig.js';
import { letterheadFromStation, showLogoFromStation } from './letterhead.js';

/** `Decantation_Report_2026-03-01_2026-03-10` (`.pdf` is added on save). */
export const decantationFileName = (report: Pick<DecantationReport, 'from' | 'to'>): string =>
  `Decantation_Report_${report.from}_${report.to}`;

/**
 * Decantation report PDF, saved or printed through the pluggable PDF route
 * (web download / hidden-iframe print, the desktop's native dialog and system
 * viewer). The `@react-pdf/renderer` document is imported at call time so it
 * stays out of the main bundle.
 */
export async function generateDecantationReportPdf(
  station: { name?: string; settings?: unknown } | null,
  report: DecantationReport,
  output: PdfOutput = 'save',
): Promise<void> {
  const doc = await import('./decantationDoc.js');
  await outputReactPdf(
    React.createElement(doc.DecantationReportDoc, {
      report,
      stationName: station?.name ?? report.stationName,
      letterhead: letterheadFromStation(station),
      paper: paperFromStation(station),
      // A station that turned its logo off must not get one back.
      showLogo: showLogoFromStation(station),
    }),
    decantationFileName(report),
    output,
  );
}
