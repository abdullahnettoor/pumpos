// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
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

/** What `generateShiftSummaryPdf` hands the saver: the document and its file name. */
const printed: { element: React.ReactElement; filename: string }[] = [];
vi.mock('../exportPdf.js', () => ({
  exportReactPdf: vi.fn(),
  outputReactPdf: (element: React.ReactElement, filename: string) => {
    printed.push({ element, filename });
    return Promise.resolve();
  },
}));
const { generateShiftSummaryPdf } = await import('./generate.js');

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
  printed.length = 0;
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

/** The screen's Drawers table: the one headed `Drawer`. */
const drawerTableOnScreen = (): HTMLElement => {
  const table = screen.getAllByRole('table').find((t) => text(t.querySelector('th')) === 'Drawer');
  if (!table) throw new Error('no Drawers table on screen');
  return table;
};
/** The screen's business-day line (`businessDayContext`), never printed. */
const BUSINESS_DAY_LINE = /^(Today's business day|A past business day)/;

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
 * in the page header, the credit sale entry panel, and the business-day line
 * (advice relative to now; paper prints the absolute dates only).
 *
 * The PDF is the one `generateShiftSummaryPdf` builds from the station and the
 * record, as the screen's Export does.
 */
const renderScreen = (record: ShiftSummaryRecord) =>
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

const renderPdf = async (record: ShiftSummaryRecord): Promise<PdfText> => {
  await generateShiftSummaryPdf(station, record.snapshotData, String(record.shiftId), undefined, {
    businessDate: record.businessDate,
    shiftSequence: record.shiftSequence,
  });
  return readPdf(printed[printed.length - 1].element);
};

const renderBoth = async (record: ShiftSummaryRecord): Promise<PdfText> => {
  renderScreen(record);
  return renderPdf(record);
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
    it('prints every table with the same headers, rows, totals and notes', async () => {
      const pdf = await renderBoth(record);
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

    it('prints the same section titles, details, context and cash lines', async () => {
      const pdf = await renderBoth(record);
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

      // The snapshot line, word for word; the business-day line stays on screen.
      const notes = Array.from(document.querySelectorAll('.print-area p')).map(text);
      for (const note of notes.filter((n) => n.startsWith('Snapshot taken'))) {
        expect(lines).toContain(note);
      }
      expect(lines.filter((l) => BUSINESS_DAY_LINE.test(l))).toEqual([]);

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
  it('2-decimal volumes, 3-decimal meter readings, stored totals, Short / Balanced', async () => {
    const pdf = await renderBoth(SHIFT_FULL_FIXTURE);
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
    // The variance total reads as its rows do: the chip on screen, its words on paper.
    expect(handovers.totals[0].at(-1)).toBe('−₹340.00');
    const total = screen.getByRole('table', { name: 'Attendant handovers' }).querySelector('tfoot');
    expect(total?.querySelector('[data-variance="short"]')?.textContent).toBe('−₹340.00');
    expect(screen.getByText("Today's business day.")).toBeTruthy();
  });

  it('a mixed-unit shift: one total row, `—` for volumes, and the note says why', async () => {
    const pdf = await renderBoth(SHIFT_MIXED_UNIT_FIXTURE);
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

  it('a total the snapshot does not store is blank in both, and the note says why', async () => {
    const pdf = await renderBoth(SHIFT_NOT_STORED_FIXTURE);
    const [nozzles, fuel, credit] = pdf.tables;
    expect(nozzles.totals[0]).toEqual(['Total of 2 nozzles', '', '', '', '150.26 L', '', '']);
    expect(fuel.totals[0]).toEqual(['Total of 1 product', '150.26 L', '', '', '']);
    expect(credit.totals[0]).toEqual(['Total of 1 credit sale', '', '', '', '', '']);
    expect(pdfNotes(pdf)).toEqual([
      'Total: testing and net volumes not stored for this shift.',
      'Total: testing and net volumes not stored for this shift; sales value total not stored for this shift.',
      'Total: credit sales total not stored for this shift.',
    ]);
  });

  it('a balanced handover total reads Balanced, on screen and on paper', async () => {
    const snap = SHIFT_MIXED_UNIT_FIXTURE.snapshotData ?? {};
    const balanced: ShiftSummaryRecord = {
      ...SHIFT_MIXED_UNIT_FIXTURE,
      snapshotData: {
        ...snap,
        handovers: (snap.handovers as object[]).map((h) => ({ ...h, varianceAmount: 0 })),
      },
    };
    const pdf = await renderBoth(balanced);
    const handovers = pdf.tables.find(
      (t) => t.headers[0] === 'ATTENDANT' && t.headers[1] === 'DISPENSER',
    );
    expect(handovers?.totals[0].at(-1)).toBe('Balanced');
    const total = screen.getByRole('table', { name: 'Attendant handovers' }).querySelector('tfoot');
    expect(total?.textContent).toContain('Balanced');
  });

  it('Drawers: the shared columns and total row, the variance total in words on paper', async () => {
    const pdf = await renderBoth(SHIFT_FULL_FIXTURE);
    const drawers = pdf.tables.find((t) => t.headers[0] === 'DRAWER');
    expect(drawers?.headers).toEqual([
      'DRAWER',
      'HANDOVER',
      'FLOAT',
      'CASH SALES',
      'DROPS',
      'EXPECTED',
      'DECLARED',
      'VARIANCE',
    ]);
    expect(drawers?.rows.map((r) => [r[0], r[1], r[7]])).toEqual([
      ['DU1 · Ravi', 'Recorded', '−₹340.00'],
      ['DU2 · Suresh', 'Recorded', 'Balanced'],
    ]);
    expect(drawers?.totals).toEqual([
      [
        'Total',
        '',
        '₹4,000.00',
        '₹1,40,000.00',
        '₹50,000.00',
        '₹94,000.00',
        '₹93,660.00',
        '−₹340.00',
      ],
    ]);
    // On screen the same total is a chip.
    const foot = drawerTableOnScreen().querySelector('tfoot');
    expect(foot?.querySelector('[data-variance="short"]')?.textContent).toBe('−₹340.00');
  });

  it('Drawers: a total that nets to zero reads Balanced, and a pending Drawer is left out', async () => {
    const snap = SHIFT_FULL_FIXTURE.snapshotData ?? {};
    const [ravi, suresh] = snap.drawers as Record<string, unknown>[];
    const record: ShiftSummaryRecord = {
      ...SHIFT_FULL_FIXTURE,
      snapshotData: {
        ...snap,
        drawers: [
          { ...ravi, variance: 0, cashHandedOver: 42000 },
          { ...suresh, cashSales: null, expectedCash: null, cashHandedOver: null, variance: null },
        ],
      },
    };
    const pdf = await renderBoth(record);
    const drawers = pdf.tables.find((t) => t.headers[0] === 'DRAWER');
    expect(drawers?.rows[1].slice(1, 2)).toEqual(['Pending']);
    expect(drawers?.totals[0][0]).toBe('Total excl. DU2, not handed over');
    expect(drawers?.totals[0].at(-1)).toBe('Balanced');
    const foot = drawerTableOnScreen().querySelector('tfoot');
    expect(foot?.textContent).toContain('Balanced');
  });

  it('a legacy snapshot: one cash variance line and its stored purchases', async () => {
    const pdf = await renderBoth(SHIFT_LEGACY_FIXTURE);
    expect(pdf.lines).toContain('Cash variance');
    expect(pdf.lines).not.toContain('Office count variance');
    const purchases = pdf.tables[pdf.tables.length - 1];
    expect(purchases.headers).toEqual(['SUPPLIER', 'REF / INVOICE', 'NOTES', 'AMOUNT']);
    expect(purchases.totals[0]).toEqual(['Total of 2 stored purchases', '', '', '₹4,51,200.50']);
  });

  it('an empty nozzle table prints the screen’s empty text', async () => {
    const empty: ShiftSummaryRecord = {
      ...SHIFT_NOT_STORED_FIXTURE,
      snapshotData: { ...SHIFT_NOT_STORED_FIXTURE.snapshotData, nozzleReadings: [] },
    };
    const pdf = await renderBoth(empty);
    expect(screen.getByText(NOZZLES_EMPTY)).toBeTruthy();
    expect(pdf.lines).toContain(NOZZLES_EMPTY);
  });
});

/**
 * The business-day line is relative to now and to the station's Day Start
 * (06:00 here). At 05:30 IST on 9 Oct the station is still on its 8 Oct
 * business day: the screen calls an 8 Oct shift today's. Paper prints the
 * absolute dates only, so its words do not depend on when it is printed.
 */
describe('Shift Summary business day and Day Start (#595)', () => {
  const BEFORE_DAY_START = new Date('2026-10-09T00:00:00.000Z'); // 05:30 IST

  it("before Day Start, the screen still calls the previous business date today's", () => {
    vi.setSystemTime(BEFORE_DAY_START);
    renderScreen(SHIFT_FULL_FIXTURE); // business date 2026-10-08
    expect(screen.getByText("Today's business day.")).toBeTruthy();
    expect(screen.queryByText(/A past business day/)).toBeNull();
  });

  it('the PDF from generateShiftSummaryPdf prints the same absolute dates at any hour', async () => {
    vi.setSystemTime(BEFORE_DAY_START);
    const early = await renderPdf(SHIFT_FULL_FIXTURE);
    vi.setSystemTime(NOW);
    const later = await renderPdf(SHIFT_FULL_FIXTURE);
    const body = (pdf: PdfText) => pdf.lines.filter((l) => !l.startsWith('Generated '));
    expect(body(early)).toEqual(body(later));
    expect(linesAfter(early, 'BUSINESS DAY', 1)).toEqual(['8 Oct 2026']);
    // Times in the station's timezone, from the station the generator was given.
    expect(linesAfter(early, 'OPENED', 1)).toEqual(['8 Oct 2026, 06:00 am']);
    expect(early.lines.filter((l) => BUSINESS_DAY_LINE.test(l))).toEqual([]);
    expect(printed[0].filename).toBe('Shift_Summary_20261008-1');
  });
});

/**
 * The fixtures are snapshots the server could have written (#287): the office
 * expects Σ declared − unassigned drops at close, the cash lines add up to it,
 * and the variances follow.
 */
describe('Shift Summary fixtures are consistent', () => {
  const twoLevel = Object.entries(SHIFT_SUMMARY_FIXTURES).filter(
    ([, r]) => Number(r.snapshotData?.cashVarianceModel ?? 1) >= 2 && r.snapshotData?.drawers,
  );
  it.each(twoLevel)('%s', (_name, record) => {
    const s = record.snapshotData as Record<string, any>;
    const cents = (n: number) => Math.round(n * 100);
    const sum = (xs: number[]) => xs.reduce((a, x) => a + cents(x), 0);
    const declared = sum(s.drawers.map((d: any) => d.cashHandedOver));
    expect(declared - cents(s.unassignedCloseCashDrops ?? 0)).toBe(cents(s.expectedCash));
    expect(
      cents(s.openingCash) +
        cents(s.cashSalesSum) -
        cents(s.handoverCashDrops) -
        cents(s.closeCashDrops),
    ).toBe(cents(s.expectedCash));
    expect(cents(s.closingCash) - cents(s.expectedCash)).toBe(cents(s.cashVariance));
    expect(sum(s.drawers.map((d: any) => d.variance))).toBe(cents(s.attendantVariance));
    expect(sum(s.handovers.map((h: any) => h.varianceAmount))).toBe(cents(s.attendantVariance));
  });
});
