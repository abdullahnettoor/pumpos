import React, { type ReactElement } from 'react';
import { Document, Page } from '@react-pdf/renderer';
import { LetterheadBand, s } from './shiftSummaryDoc.js';
import { ShiftSummaryDoc } from './shiftSummaryDoc.js';
import { DssrDoc } from './dssrDoc.js';
import { AttendantReportDoc } from './attendantReportDoc.js';
import {
  attendantReportDocConfig,
  dssrDocConfig,
  shiftSummaryDocConfig,
  type DocConfigOverrides,
} from './reportConfig.js';
import type { Letterhead } from './letterhead.js';
import type { ReportTemplateId } from './reportTemplates.js';
import { SHIFT_FULL_FIXTURE } from './samples/shiftSummarySample.js';
import { DSSR_PARITY_FIXTURE } from './samples/dssrSample.js';
import { ATTENDANT_STATEMENT_SAMPLE } from './samples/attendantSample.js';

/*
 * The documents the on-screen previews draw (#605). Each is the real PDF
 * document, configured the way the export configures it, printing sample
 * data: the parity tests' stored Shift Summary and DSR, and a one-day
 * attendant statement. Loaded on demand with the PDF engine.
 */

/** The station fields a printed report reads: its name, letterhead, logo and clock. */
export interface PreviewStation {
  name?: string;
  settings?: Record<string, unknown> | null;
}

export interface TemplatePreviewInput extends DocConfigOverrides {
  template: ReportTemplateId;
  station: PreviewStation | null;
}

/** One report, laid out with the template being edited, on sample data. */
export function templatePreviewDoc(input: TemplatePreviewInput): ReactElement {
  const { template, station, ...over } = input;
  switch (template) {
    case 'shiftSummary': {
      const record = SHIFT_FULL_FIXTURE;
      const timeZone = (station?.settings as { timezone?: string } | null | undefined)?.timezone;
      return (
        <ShiftSummaryDoc
          snapshot={{
            ...record.snapshotData,
            businessDate: record.businessDate,
            shiftSequence: record.shiftSequence,
          }}
          config={shiftSummaryDocConfig(station, over)}
          clock={{ timeZone }}
        />
      );
    }
    case 'dssr':
      return <DssrDoc dssr={DSSR_PARITY_FIXTURE} config={dssrDocConfig(station, over)} />;
    case 'attendantReport':
      return (
        <AttendantReportDoc
          data={ATTENDANT_STATEMENT_SAMPLE}
          config={attendantReportDocConfig(station, over)}
        />
      );
  }
}

export interface LetterheadPreviewInput {
  letterhead: Letterhead;
  /** The document title printed in the band. */
  title: string;
}

/** A4 width in points; the letterhead page is one band tall. */
const A4_WIDTH = 595.28;
const LETTERHEAD_HEIGHT = 140;

/** The letterhead band alone, as every report and invoice prints it. */
export function letterheadPreviewDoc({ letterhead, title }: LetterheadPreviewInput): ReactElement {
  return (
    <Document>
      <Page size={[A4_WIDTH, LETTERHEAD_HEIGHT]} style={[s.page, { paddingBottom: 24 }]}>
        <LetterheadBand title={title} letterhead={letterhead} />
      </Page>
    </Document>
  );
}
