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
});
