// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import {
  DSSR_EMPTY_DAY_FIXTURE,
  DSSR_KG_DAY_FIXTURE,
  DSSR_NOT_STORED_FIXTURE,
  DSSR_PARITY_FIXTURE,
} from '../../test/dssrFixture.js';
import { readPdf, type PdfText } from '../../test/pdfTree.js';
import { DailyDssrView } from '../../components/DailyDssrView.js';
import { DSSR_EMPTY } from '../../components/reports/dssr/dssrColumns.js';
import type { DssrRow } from '../../components/reports/dssr/dssrModel.js';
import { DssrDoc } from './dssrDoc.js';
import { DEFAULT_DSSR_CONFIG } from './reportConfig.js';

afterEach(cleanup);

const station = {
  id: 'st-1',
  name: 'Apex Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};

const text = (el: Element | null | undefined): string => el?.textContent?.trim() ?? '';

/** The screen's tables, each as its rows of cell text (header row first, total row last). */
const screenTables = (): string[][][] =>
  screen
    .queryAllByRole('table')
    .map((table) =>
      Array.from(table.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th, td')).map(text),
      ),
    );

/**
 * #580: one stored DSR reads the same on the screen (`DailyDssrView`, through
 * `dssrModel`) and in the PDF (`DssrDoc`): the same rows, words and totals.
 * The PDF only prints headings and column headers uppercase, as the screen's
 * styles show them.
 *
 * Not compared, because only the screen shows them: the daily warnings and
 * the late-entry banner, and the Sealed / Open / Draft chip in the page
 * header (the PDF marks a draft with its own banner).
 */
const renderBoth = (fixture: DssrRow) => {
  renderWithProviders(
    <DailyDssrView dailyDssr={fixture} station={station} userRole="Owner" onBack={() => {}} />,
  );
  return readPdf(
    <DssrDoc
      dssr={fixture}
      config={DEFAULT_DSSR_CONFIG}
      printedAt={new Date('2026-10-09T06:00:00.000Z')}
    />,
  );
};

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

const days: Record<string, DssrRow> = {
  'a full day': DSSR_PARITY_FIXTURE,
  'an empty day': DSSR_EMPTY_DAY_FIXTURE,
  'a kg day without stored totals': DSSR_NOT_STORED_FIXTURE,
  'a kg-only day': DSSR_KG_DAY_FIXTURE,
};

describe.each(Object.entries(days))('DSR screen and PDF parity (#580): %s', (_name, fixture) => {
  it('prints every table with the same headers, rows and totals', () => {
    const pdf = renderBoth(fixture);
    const onScreen = screenTables();
    expect(pdf.tables).toHaveLength(onScreen.length);
    onScreen.forEach(([headers, ...body], i) => {
      const printed = pdf.tables[i];
      expect(printed.headers).toEqual(headers.map((h) => h.toUpperCase()));
      expect([...printed.rows, ...printed.totals]).toEqual(body);
    });
    // The note under each table, saying why a total is `—` or blank.
    expect(pdfNotes(pdf)).toEqual(screenNotes());
  });

  it('prints the same section titles, tiles and sales lines', () => {
    const pdf = renderBoth(fixture);
    const lines = pdf.lines;
    const after = (from: number, wanted: string) => lines.indexOf(wanted, from);

    // Section titles, in the screen's order (the page title is the app's, not the report's).
    const headings = Array.from(document.querySelectorAll('h2, h3')).map(text);
    expect(headings.length).toBeGreaterThanOrEqual(4);
    let at = 0;
    for (const heading of headings) {
      const found = after(at, heading.toUpperCase());
      expect(found, heading).toBeGreaterThanOrEqual(at);
      at = found;
    }

    // Each margin tile: its label, figure and hint, in that order.
    const strip = screen.getByText('Shifts included').closest('.grid') as HTMLElement;
    for (const tile of Array.from(strip.children)) {
      const [label, value, hint] = Array.from(tile.children).map(text);
      const found = lines.indexOf(label.toUpperCase());
      expect(lines.slice(found, found + 3)).toEqual([label.toUpperCase(), value, hint]);
    }

    // The sales summary, line by line.
    const list = document.querySelector('dl[aria-label="Sales summary"]') as HTMLElement;
    const pairs = Array.from(list.querySelectorAll('dt')).map((dt) => [
      text(dt),
      text(dt.nextElementSibling),
    ]);
    expect(pairs.length).toBeGreaterThan(0);
    const start = lines.indexOf(pairs[0][0]);
    expect(lines.slice(start, start + pairs.length * 2)).toEqual(pairs.flat());
  });
});

describe('DSR screen and PDF parity (#580): the words they once disagreed on', () => {
  it('2-decimal volumes, Short / Surplus / Balanced, one mixed-unit total', () => {
    const pdf = renderBoth(DSSR_PARITY_FIXTURE);
    const [fuel] = pdf.tables;
    expect(fuel.rows[0][1]).toBe('2,405.13 L');
    expect(fuel.totals[0]).toEqual(['Total', '—', '—', '—', '₹3,98,000.25']);
    expect(pdf.tables.flatMap((t) => t.rows.map((r) => r[r.length - 1]))).toEqual(
      expect.arrayContaining(['Short', 'Surplus', 'Balanced']),
    );
    // The shift total is the snapshot's: no net volume across L and kg.
    const shifts = pdf.tables.find((t) => t.headers[0] === 'SHIFT');
    expect(shifts?.totals[0].slice(0, 4)).toEqual(['Total', '', '', '—']);
    // Nor in any one shift's: a shift's volume adds L and kg (#587).
    expect(shifts?.rows.map((r) => r[3])).toEqual(['—', '—']);
    // The reasons sit under the tables, one line each, not in the total label.
    expect(pdfNotes(pdf)).toEqual([
      'Total: volumes not added across L and kg.',
      null,
      null,
      null,
      'Total: volumes not added across L and kg; attendant var. excl. 1 shift without a separate attendant variance.',
      null,
    ]);
  });

  it('an empty day prints the empty fuel, nozzle and shift sections with the screen’s text', () => {
    const pdf = renderBoth(DSSR_EMPTY_DAY_FIXTURE);
    for (const message of [DSSR_EMPTY.fuel, DSSR_EMPTY.nozzles, DSSR_EMPTY.shifts]) {
      expect(screen.getByText(message)).toBeTruthy();
      expect(pdf.lines).toContain(message);
    }
    expect(pdf.tables).toHaveLength(0);
  });

  it('a total the snapshot does not store is blank in both, and the note says why', () => {
    const pdf = renderBoth(DSSR_NOT_STORED_FIXTURE);
    const [fuel, shifts, attendants] = pdf.tables;
    expect(fuel.totals[0]).toEqual(['Total', '310.00 kg', '10.00 kg', '', '₹25,000.00']);
    expect(shifts.totals[0]).toEqual(['Total', '', '', '', '', '']);
    expect(attendants.totals[0]).toEqual(['Total', '']);
    expect(pdfNotes(pdf)).toEqual([
      'Total: net volume not stored for this day.',
      'Total: net volume not stored for this day; variance totals not stored for this day.',
      'Total: variance total not stored for this day.',
    ]);
    expect(screenNotes()).toEqual(pdfNotes(pdf));
    // The shift row is in the day's unit, kg, though its total is not stored (#587).
    expect(shifts.rows.map((r) => r[3])).toEqual(['300.00 kg']);
  });

  it('a kg-only day prints every shift net volume in kg, the total too (#587)', () => {
    const pdf = renderBoth(DSSR_KG_DAY_FIXTURE);
    const shifts = pdf.tables.find((t) => t.headers[0] === 'SHIFT');
    expect(shifts?.rows.map((r) => r[3])).toEqual(['250.25 kg', '159.75 kg']);
    expect(shifts?.totals[0][3]).toBe('410.00 kg');
  });
});
