// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { resolveBusinessDate } from '@pump/shared';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import {
  SHIFT_FULL_FIXTURE,
  SHIFT_LEGACY_FIXTURE,
  SHIFT_MIXED_UNIT_FIXTURE,
  SHIFT_NOT_STORED_FIXTURE,
  SHIFT_SUMMARY_FIXTURES,
} from '../../test/shiftSummaryFixture.js';
import { readPdf, type PdfText } from '../../test/pdfTree.js';
import { ShiftSummaryView } from '../../components/Shifts/ShiftSummaryView.js';
import { NOZZLES_EMPTY, SIGNATURE_LINES } from '../../components/Shifts/shiftSummaryColumns.js';
import type { ShiftSummaryRecord } from '../../components/Shifts/shiftSummaryModel.js';
import { ShiftSummaryDoc } from './shiftSummaryDoc.js';
import { DEFAULT_SHIFT_SUMMARY_CONFIG } from './reportConfig.js';

const station = {
  id: 'st-1',
  name: 'Apex Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};
/** The day the tests run on: the full and mixed fixtures are today's, the rest are past. */
const NOW = new Date('2026-10-08T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const text = (el: Element | null | undefined): string => el?.textContent?.trim() ?? '';

/**
 * A cell's words with its line breaks and separators flattened: the screen
 * stacks a second line (`POS 1` over `Pine Labs`) where the PDF joins it with
 * ` · ` or `, `, so both read `POS 1 Pine Labs` here.
 */
const flat = (s: string): string =>
  s
    .replace(/ · |, /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A screen cell's text: its text nodes, one word group each, joined by a space. */
const cellText = (cell: Element): string => {
  const parts: string[] = [];
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? '');
  return flat(parts.join(' '));
};

/** The screen's tables, each as its rows of cell text (header row first, total row last). */
const screenTables = (): string[][][] =>
  screen
    .queryAllByRole('table')
    .map((table) =>
      Array.from(table.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th, td')).map(cellText),
      ),
    );

const NOTE = /^Total: /;

/** The note under each screen table (`Total: …`), or null where there is none. */
const screenNotes = (): (string | null)[] =>
  screen.queryAllByRole('table').map((table) => {
    const section = table.closest('section');
    const notes = Array.from(section?.querySelectorAll('p') ?? []).map(text);
    return notes.find((n) => NOTE.test(n)) ?? null;
  });

/** The line the PDF prints right under each table, when it is a total note. */
const pdfNotes = (pdf: PdfText): (string | null)[] => {
  let at = 0;
  return pdf.tables.map((t) => {
    const start = pdf.lines.indexOf(t.headers.join(' | '), at);
    at = start + 1 + t.rows.length + t.totals.length;
    const next = pdf.lines[at];
    return next && NOTE.test(next) ? next : null;
  });
};

/**
 * #595: one stored Shift Summary reads the same on the screen
 * (`ShiftSummaryView`, through `shiftSummaryModel`) and in the PDF
 * (`ShiftSummaryDoc`), as `generateShiftSummaryPdf` builds it: the same rows,
 * words, totals and notes. The PDF prints headings and column headers
 * uppercase, as the screen's styles show them.
 *
 * Not compared, because only the screen shows them: the Closed / Locked chip
 * in the page header and the credit sale entry panel (not on paper).
 */
const renderBoth = (record: ShiftSummaryRecord) => {
  renderWithProviders(
    <ShiftSummaryView
      shiftSummary={record}
      userRole="Staff"
      canReopen={false}
      onReopenSuccess={() => {}}
      onBack={() => {}}
      station={station}
    />,
  );
  const clock = {
    timeZone: station.settings.timezone,
    currentBusinessDate: resolveBusinessDate({
      now: new Date(),
      timeZone: station.settings.timezone,
      dayStartsAt: station.settings.business_day_starts_at,
    }),
  };
  return readPdf(
    <ShiftSummaryDoc
      snapshot={{
        ...record.snapshotData,
        businessDate: record.businessDate,
        shiftSequence: record.shiftSequence,
      }}
      config={{ ...DEFAULT_SHIFT_SUMMARY_CONFIG, stationName: station.name }}
      clock={clock}
    />,
  );
};

/** The lines that follow `from` in the PDF, `n` of them. */
const linesAfter = (pdf: PdfText, from: string, n: number): string[] => {
  const at = pdf.lines.indexOf(from);
  expect(at, from).toBeGreaterThanOrEqual(0);
  return pdf.lines.slice(at + 1, at + 1 + n);
};

describe.each(Object.entries(SHIFT_SUMMARY_FIXTURES))(
  'Shift Summary screen and PDF parity (#595): %s',
  (_name, record) => {
    it('prints every table with the same headers, rows, totals and notes', () => {
      const pdf = renderBoth(record);
      const onScreen = screenTables();
      expect(onScreen.length).toBeGreaterThan(0);
      expect(pdf.tables).toHaveLength(onScreen.length);
      onScreen.forEach(([headers, ...body], i) => {
        const printed = pdf.tables[i];
        expect(printed.headers).toEqual(headers.map((h) => h.toUpperCase()));
        expect([...printed.rows, ...printed.totals].map((row) => row.map(flat))).toEqual(body);
      });
      // The note under each table, saying why a total is `—` or blank.
      expect(pdfNotes(pdf)).toEqual(screenNotes());
    });

    it('prints the same section titles, details, context and cash lines', () => {
      const pdf = renderBoth(record);
      const lines = pdf.lines;

      // Section titles, in the screen's order (the page title is the app's, not the report's).
      const headings = Array.from(document.querySelectorAll('section h2')).map(text);
      expect(headings.length).toBeGreaterThanOrEqual(2);
      let at = 0;
      for (const heading of headings) {
        const found = lines.indexOf(heading.toUpperCase(), at);
        expect(found, heading).toBeGreaterThanOrEqual(at);
        at = found;
      }

      // The details row: each label and its value.
      const details = document.querySelector('.print-area dl') as HTMLElement;
      for (const dt of Array.from(details.querySelectorAll('dt'))) {
        expect(linesAfter(pdf, text(dt).toUpperCase(), 1)).toEqual([text(dt.nextElementSibling)]);
      }

      // The business-day line and the snapshot line, word for word.
      const notes = Array.from(document.querySelectorAll('.print-area p')).map(text);
      for (const note of notes.filter((n) => !NOTE.test(n))) expect(lines).toContain(note);

      // The cash reconciliation, line by line.
      const cash = document.querySelector('dl[aria-label="Cash reconciliation"]') as HTMLElement;
      const pairs = Array.from(cash.querySelectorAll('dt')).map((dt) => [
        text(dt),
        text(dt.nextElementSibling),
      ]);
      expect(pairs.length).toBeGreaterThan(0);
      const start = lines.indexOf(pairs[0][0]);
      expect(lines.slice(start, start + pairs.length * 2)).toEqual(pairs.flat());

      // The signature lines close the paper, before the page footer.
      expect(lines.slice(-3, -1)).toEqual([...SIGNATURE_LINES]);
    });
  },
);

describe('Shift Summary screen and PDF parity (#595): the words they once disagreed on', () => {
  it('2-decimal volumes, 3-decimal meter readings, stored totals, Short / Balanced', () => {
    const pdf = renderBoth(SHIFT_FULL_FIXTURE);
    const [nozzles, fuel, handovers] = pdf.tables;
    expect(nozzles.rows[0]).toEqual([
      'N1',
      'Petrol (MS)',
      '1,20,450.125 L',
      '1,21,262.581 L',
      '812.46 L',
      '5.00 L',
      '807.46 L',
    ]);
    expect(nozzles.totals).toEqual([
      ['Total of 3 nozzles', '', '', '', '2,016.76 L', '10.00 L', '2,006.76 L'],
    ]);
    expect(fuel.totals[0]).toEqual([
      'Total of 2 products',
      '2,016.76 L',
      '10.00 L',
      '2,006.76 L',
      '₹1,89,341.75',
    ]);
    expect(handovers.rows.map((r) => r[r.length - 1])).toEqual(['−₹340.00', 'Balanced']);
    expect(pdf.lines).toContain("Today's business day.");
  });

  it('a mixed-unit shift: one total row, `—` for volumes, and the note says why', () => {
    const pdf = renderBoth(SHIFT_MIXED_UNIT_FIXTURE);
    const [nozzles, fuel] = pdf.tables;
    expect(nozzles.rows[1].slice(2)).toEqual([
      '3,400.250 kg',
      '3,611.000 kg',
      '210.75 kg',
      '0.00 kg',
      '210.75 kg',
    ]);
    expect(nozzles.totals).toEqual([['Total of 2 nozzles', '', '', '', '—', '—', '—']]);
    expect(fuel.totals).toEqual([['Total of 2 products', '—', '—', '—', '₹69,271.49']]);
    expect(pdfNotes(pdf).slice(0, 2)).toEqual([
      'Total: volumes not added across L and kg.',
      'Total: volumes not added across L and kg.',
    ]);
  });

  it('a total the snapshot does not store is blank in both, and the note says why', () => {
    const pdf = renderBoth(SHIFT_NOT_STORED_FIXTURE);
    const [nozzles, fuel, credit] = pdf.tables;
    expect(nozzles.totals[0]).toEqual(['Total of 2 nozzles', '', '', '', '150.26 L', '', '']);
    expect(fuel.totals[0]).toEqual(['Total of 1 product', '150.26 L', '', '', '']);
    expect(credit.totals[0]).toEqual(['Total of 1 credit sale', '', '', '', '', '']);
    expect(pdfNotes(pdf)).toEqual([
      'Total: testing and net volumes not stored for this shift.',
      'Total: testing and net volumes not stored for this shift; sales value total not stored for this shift.',
      'Total: credit sales total not stored for this shift.',
    ]);
    expect(pdf.lines).toContain(
      "A past business day: a credit sale logged here belongs to this shift, not today's.",
    );
  });

  it('a legacy snapshot: one cash variance line and its stored purchases', () => {
    const pdf = renderBoth(SHIFT_LEGACY_FIXTURE);
    expect(pdf.lines).toContain('Cash variance');
    expect(pdf.lines).not.toContain('Office count variance');
    const purchases = pdf.tables[pdf.tables.length - 1];
    expect(purchases.headers).toEqual(['SUPPLIER', 'REF / INVOICE', 'NOTES', 'AMOUNT']);
    expect(purchases.totals[0]).toEqual(['Total of 2 stored purchases', '', '', '₹4,51,200.50']);
  });

  it('an empty nozzle table prints the screen’s empty text', () => {
    const empty: ShiftSummaryRecord = {
      ...SHIFT_NOT_STORED_FIXTURE,
      snapshotData: { ...SHIFT_NOT_STORED_FIXTURE.snapshotData, nozzleReadings: [] },
    };
    const pdf = renderBoth(empty);
    expect(screen.getByText(NOZZLES_EMPTY)).toBeTruthy();
    expect(pdf.lines).toContain(NOZZLES_EMPTY);
  });
});
