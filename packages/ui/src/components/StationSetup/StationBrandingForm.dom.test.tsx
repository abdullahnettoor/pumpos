// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Station } from '@pump/shared';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { UnsavedSectionsProvider } from '../../pump-ds/index.js';
import { __resetUnsavedChangesForTests } from '../../pump-ds/form/unsavedChanges.js';

/** Station › Branding: a live preview of the letterhead its PDFs print (#615 review). */

const drawn = vi.hoisted(() => ({ elements: [] as any[] }));
vi.mock('../../services/exportPdf.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  renderPdf: async (element: unknown) => {
    drawn.elements.push(element);
    return new Uint8Array([37, 80, 68, 70]);
  },
}));
vi.mock('../../services/reports/pdfRaster.js', () => ({
  rasterizePdf: async () => [{ src: 'data:image/png;base64,AA==', width: 1040, height: 244 }],
}));
const { StationBrandingForm } = await import('./StationBrandingForm.js');
const { LetterheadBand } = await import('../../services/reports/shiftSummaryDoc.js');

afterEach(() => {
  cleanup();
  __resetUnsavedChangesForTests();
  drawn.elements = [];
});

const station = {
  id: 'st-1',
  name: 'Tirur Fuels',
  address: 'Bypass Road, Tirur',
  settings: { legal: { gstin: '32ABCDE1234F1Z9' }, fuel_brand: 'Indian Oil' },
} as unknown as Station;

/** The band in the last drawn letterhead document. */
const band = () =>
  drawn.elements.at(-1)?.props.children.props.children as React.ReactElement<any> | undefined;

describe('Branding letterhead preview (#615 review)', () => {
  it('draws the PDFs’ band with the export’s fallbacks, then the values as typed', async () => {
    renderWithProviders(
      <UnsavedSectionsProvider>
        <StationBrandingForm station={station} onSave={vi.fn()} onDiscard={() => {}} />
      </UnsavedSectionsProvider>,
    );
    await waitFor(() => expect(band()?.type).toBe(LetterheadBand));
    // No legal name or address in Branding: the station's print, as in the export.
    expect(band()!.props.letterhead).toMatchObject({
      legalName: 'Tirur Fuels',
      addressLine: 'Bypass Road, Tirur',
      gstin: '32ABCDE1234F1Z9',
      fuelBrand: 'Indian Oil',
    });
    fireEvent.change(screen.getByLabelText('Legal / trade name'), {
      target: { value: 'Tirur Fuels LLP' },
    });
    await waitFor(() => expect(band()!.props.letterhead.legalName).toBe('Tirur Fuels LLP'));
    expect(await screen.findByRole('img', { name: "This station's letterhead" })).toBeTruthy();
  });
});
