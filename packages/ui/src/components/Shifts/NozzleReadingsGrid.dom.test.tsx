// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NozzleReadingsGrid } from './NozzleReadingsGrid.js';

describe('NozzleReadingsGrid', () => {
  afterEach(cleanup);

  it('renders calculated sales values with exactly two decimals', () => {
    render(
      <NozzleReadingsGrid
        nozzleReadings={[
          {
            nozzleId: 'nozzle-1',
            nozzleName: 'N1',
            duCode: 'DU-1',
            productName: 'Petrol',
            productCode: 'MS',
            tankName: 'Tank 1',
            openingReading: 1000,
            unitPrice: 100,
            unit: 'L',
          },
        ]}
        closingReadings={{ 'nozzle-1': 2020.78132 }}
        staffAssignments={[]}
      />,
    );

    expect(screen.getByText('₹1,02,078.13')).toBeDefined();
    expect(screen.queryByText('₹1,02,078.132')).toBeNull();
  });

  /**
   * The order an attendant reads down at shift close. The comparator itself is
   * unit-tested in `@pump/shared`; what these pin is the part this surface
   * owns — which fields it hands the comparator. A transposed or typo'd
   * accessor is invisible to the shared tests and reorders real hardware.
   */
  describe('the order nozzles are listed in (#244)', () => {
    const nozzle = (over: Record<string, unknown>) => ({
      nozzleId: String(over.nozzleName ?? 'x'),
      productName: 'Petrol',
      productCode: 'MS',
      tankName: 'Tank 1',
      openingReading: 0,
      unitPrice: 100,
      unit: 'L',
      ...over,
    });

    const listed = (rows: Record<string, unknown>[]): string[] => {
      render(
        <NozzleReadingsGrid
          nozzleReadings={rows as never}
          closingReadings={{}}
          staffAssignments={[]}
        />,
      );
      return Array.from(document.querySelectorAll('tbody tr')).map(
        (tr) => tr.querySelector('td')?.textContent?.trim() ?? '',
      );
    };

    it('groups by dispenser first, then orders nozzles naturally', () => {
      const order = listed([
        nozzle({ nozzleName: 'N10', duCode: 'DU-1' }),
        nozzle({ nozzleName: 'N1', duCode: 'DU-2' }),
        nozzle({ nozzleName: 'N2', duCode: 'DU-1' }),
      ]);
      // DU-1's nozzles come first, and N10 follows N2 inside it.
      expect(order.map((t) => t.replace(/\s+/g, ''))).toEqual(['N2', 'N10', 'N1']);
    });

    it('keys the dispenser on its code, not its name', () => {
      // The two disagree on purpose: name order is the reverse of code order.
      // Reading `duName` first would flip this list.
      const order = listed([
        nozzle({ nozzleName: 'N1', duCode: 'DU-2', duName: 'Alpha' }),
        nozzle({ nozzleName: 'N2', duCode: 'DU-1', duName: 'Zulu' }),
      ]);
      expect(order.map((t) => t.replace(/\s+/g, ''))).toEqual(['N2', 'N1']);
    });

    it('falls back to the dispenser name when there is no code', () => {
      const order = listed([
        nozzle({ nozzleName: 'N1', duCode: null, duName: 'DU-2' }),
        nozzle({ nozzleName: 'N2', duCode: null, duName: 'DU-1' }),
      ]);
      expect(order.map((t) => t.replace(/\s+/g, ''))).toEqual(['N2', 'N1']);
    });

    it('ignores case, so a renamed nozzle does not jump the list', () => {
      // The delta #241 introduced here and never pinned.
      const order = listed([
        nozzle({ nozzleName: 'n10', duCode: 'du-1' }),
        nozzle({ nozzleName: 'N2', duCode: 'DU-1' }),
      ]);
      expect(order.map((t) => t.replace(/\s+/g, ''))).toEqual(['N2', 'n10']);
    });
  });
});
