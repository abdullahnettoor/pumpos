import React from 'react';
import { exportReactPdf } from '../exportPdf.js';
import {
  DEFAULT_ATTENDANT_REPORT_CONFIG,
  DEFAULT_DSSR_CONFIG,
  DEFAULT_SHIFT_SUMMARY_CONFIG,
  paperFromStation,
} from './reportConfig.js';
import { letterheadFromStation } from './letterhead.js';

/**
 * One-call report PDF generators that build the station-configured document and
 * route it through the pluggable saver (web download, desktop Tauri dialog, or
 * mobile share sheet). The heavy `@react-pdf/renderer` doc modules are imported
 * dynamically at call time so they never land in the main bundle.
 */

/** DSSR PDF. `dssr` = { snapshotData, businessDate, generatedAt }. */
export async function generateDssrPdf(station: any, dssr: any): Promise<void> {
  const doc = await import('./dssrDoc.js');
  const sections = station?.settings?.report_config?.dssr?.length
    ? station.settings.report_config.dssr
    : DEFAULT_DSSR_CONFIG.sections;
  const config = {
    ...DEFAULT_DSSR_CONFIG,
    sections: sections,
    stationName: station?.name,
    letterhead: letterheadFromStation(station),
    paper: paperFromStation(station),
  };
  await exportReactPdf(
    React.createElement(doc.DssrDoc, { dssr, config }),
    `Daily_DSSR_${dssr?.businessDate || ''}`,
  );
}

/** Shift Summary PDF from an immutable shift-summary snapshot. */
export async function generateShiftSummaryPdf(
  station: any,
  snapshot: any,
  shiftId: string,
  templateName?: string,
): Promise<void> {
  const doc = await import('./shiftSummaryDoc.js');
  const sections = station?.settings?.report_config?.shiftSummary?.length
    ? station.settings.report_config.shiftSummary
    : DEFAULT_SHIFT_SUMMARY_CONFIG.sections;
  const config = {
    ...DEFAULT_SHIFT_SUMMARY_CONFIG,
    sections: sections,
    stationName: station?.name || templateName,
    letterhead: letterheadFromStation(station),
    paper: paperFromStation(station),
  };
  await exportReactPdf(
    React.createElement(doc.ShiftSummaryDoc, { snapshot, config }),
    `Shift_Summary_${String(shiftId).slice(0, 8)}`,
  );
}

/**
 * Attendant Handover Report PDF — a statement for ONE attendant over one
 * Business-Date range. `entry` is that attendant's report entry; `period`
 * carries the range and generation instant the report was composed with.
 */
export async function generateAttendantReportPdf(
  station: any,
  entry: any,
  period: { from: string; to: string; generatedAt?: string },
): Promise<void> {
  const doc = await import('./attendantReportDoc.js');
  const sections = station?.settings?.report_config?.attendantReport?.length
    ? station.settings.report_config.attendantReport
    : DEFAULT_ATTENDANT_REPORT_CONFIG.sections;
  const config = {
    ...DEFAULT_ATTENDANT_REPORT_CONFIG,
    sections,
    stationName: station?.name,
    letterhead: letterheadFromStation(station),
    paper: paperFromStation(station),
  };
  await exportReactPdf(
    React.createElement(doc.AttendantReportDoc, { data: { ...entry, ...period }, config }),
    `Attendant_Report_${String(entry?.attendantName || '').replace(/\s+/g, '_')}_${period.from}_${period.to}`,
  );
}
