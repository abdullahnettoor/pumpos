// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { DSSR_PARITY_FIXTURE } from '../../test/dssrFixture.js';
import { readPdf } from '../../test/pdfTree.js';
import { DailyDssrView } from '../../components/DailyDssrView.js';
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
    .getAllByRole('table')
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
 */
describe('DSR screen and PDF parity (#580)', () => {
  const renderBoth = () => {
    renderWithProviders(
      <DailyDssrView
        dailyDssr={DSSR_PARITY_FIXTURE}
        station={station}
        userRole="Owner"
        onBack={() => {}}
      />,
    );
    return readPdf((DssrDoc as any)({ dssr: DSSR_PARITY_FIXTURE, config: DEFAULT_DSSR_CONFIG }));
  };

  it('prints every table with the same headers, rows and totals', () => {
    const pdf = renderBoth();
    const onScreen = screenTables();
    expect(pdf.tables).toHaveLength(onScreen.length);
    onScreen.forEach(([headers, ...body], i) => {
      const printed = pdf.tables[i];
      expect(printed.headers).toEqual(headers.map((h) => h.toUpperCase()));
      expect([...printed.rows, ...printed.totals]).toEqual(body);
    });
    // The words the two once disagreed on.
    const fuel = pdf.tables[0];
    expect(fuel.totals[0][0]).toBe('Total (volumes not added across L and kg)');
    expect(fuel.rows[0][1]).toBe('2,405.13 L');
    expect(pdf.tables.flatMap((t) => t.rows.map((r) => r[r.length - 1]))).toEqual(
      expect.arrayContaining(['Short', 'Surplus', 'Balanced']),
    );
  });

  it('prints the same section titles, tiles and sales lines', () => {
    const pdf = renderBoth();
    const lines = pdf.lines;
    const after = (from: number, wanted: string) => lines.indexOf(wanted, from);

    // Section titles, in the screen's order (the page title is the app's, not the report's).
    const headings = Array.from(document.querySelectorAll('h2, h3')).map(text);
    expect(headings).toHaveLength(7);
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
    expect(pairs.length).toBeGreaterThan(5);
    const start = lines.indexOf(pairs[0][0]);
    expect(lines.slice(start, start + pairs.length * 2)).toEqual(pairs.flat());
  });
});
