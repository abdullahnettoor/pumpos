import React from 'react';
import { exportReactPdf } from '../exportPdf.js';
import {
  DEFAULT_ATTENDANT_REPORT_CONFIG,
  DEFAULT_DSSR_CONFIG,
  DEFAULT_SHIFT_SUMMARY_CONFIG,
  paperFromStation,
} from './reportConfig.js';
import { letterheadFromStation, showLogoFromStation } from './letterhead.js';
import { formatShiftLabel, shiftDisplayLabel } from '@pump/shared';
import type { AttendantReportEntry } from '@pump/shared';
import type { AttendantReportSection } from './reportConfig.js';

/** The slice of station settings the report generators read. */
interface StationReportSettings {
  report_config?: { attendantReport?: string[] } | null;
}

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

/**
 * Shift Summary PDF from an immutable shift-summary snapshot.
 *
 * `businessDate`/`shiftSequence` come from the read, not the snapshot, and name
 * the shift `YYYYMMDD-N` (#228) — in the document and in the file name — so the
 * PDF, the screen and the attendant statement agree. Older snapshots without
 * them fall back to a UUID fragment.
 */
export async function generateShiftSummaryPdf(
  station: any,
  snapshot: any,
  shiftId: string,
  templateName?: string,
  shift?: { businessDate?: string | null; shiftSequence?: number | null },
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
  const businessDate = shift?.businessDate ?? snapshot?.businessDate ?? null;
  const shiftSequence = shift?.shiftSequence ?? snapshot?.shiftSequence ?? null;
  await exportReactPdf(
    React.createElement(doc.ShiftSummaryDoc, {
      snapshot: { ...snapshot, businessDate, shiftSequence },
      config,
    }),
    // File names stay ASCII: the display fallback carries an ellipsis.
    `Shift_Summary_${formatShiftLabel(businessDate, shiftSequence) ?? String(shiftId).slice(0, 8)}`,
  );
}

/**
 * Attendant Handover Report PDF — a statement for ONE attendant over one
 * Business-Date range. `entry` is that attendant's report entry; `period`
 * carries the range and generation instant the report was composed with.
 */
export async function generateAttendantReportPdf(
  station: { name?: string; settings?: Record<string, unknown> } | null,
  entry: AttendantReportEntry,
  period: { from: string; to: string; generatedAt: string },
): Promise<void> {
  const doc = await import('./attendantReportDoc.js');
  const configured = (station?.settings as StationReportSettings | undefined)?.report_config
    ?.attendantReport;
  const sections = configured?.length
    ? (configured as AttendantReportSection[])
    : DEFAULT_ATTENDANT_REPORT_CONFIG.sections;
  const config = {
    ...DEFAULT_ATTENDANT_REPORT_CONFIG,
    sections,
    stationName: station?.name,
    letterhead: letterheadFromStation(station),
    paper: paperFromStation(station),
    // A station that turned its logo off must not get one back.
    showLogo: showLogoFromStation(station),
  };
  await exportReactPdf(
    React.createElement(doc.AttendantReportDoc, { data: { ...entry, ...period }, config }),
    `Attendant_Report_${entry.attendantName.replace(/\s+/g, '_')}_${period.from}_${period.to}`,
  );
}
