/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders.js';

const updateStation = vi.fn(async (_id: string, body: any) => ({ id: 'st-1', ...body }));
let capability: 'enabled' | 'hidden' = 'enabled';

vi.mock('../../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudStationService: class {
    updateStation = updateStation;
  },
}));
vi.mock('../../../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCapability: () => ({ status: capability }),
}));

const { ReportTemplatesPanel } = await import('./ReportTemplatesPanel.js');

const station = {
  id: 'st-1',
  name: 'Agent Test Station',
  settings: {
    legal: { gstin: '32ABCDE1234F1Z5' },
    report_config: { dssr: ['header', 'kpis'], paper: 'A4', showLogo: true },
  },
};

beforeEach(() => {
  capability = 'enabled';
  updateStation.mockClear();
});
afterEach(cleanup);

const card = (id: string) => screen.getByTestId(`template-card-${id}`);

function openShiftSummary() {
  renderWithProviders(<ReportTemplatesPanel selectedStation={station} />);
  fireEvent.click(screen.getByRole('button', { name: 'Customize Shift Summary' }));
  return document.querySelector('.drawer-container') as HTMLElement;
}

describe('Templates cards', () => {
  it('shows one card per report with its section count and preset', () => {
    renderWithProviders(<ReportTemplatesPanel selectedStation={station} />);
    expect(within(card('shiftSummary')).getByText('10 of 10 sections')).toBeTruthy();
    expect(within(card('shiftSummary')).getByText('Full')).toBeTruthy();
    expect(within(card('dssr')).getByText('2 of 9 sections')).toBeTruthy();
    expect(within(card('dssr')).getByText('Custom')).toBeTruthy();
    expect(within(card('shiftSummary')).getByText('Printed when a shift is closed')).toBeTruthy();
  });

  it('offers the Attendant Handover card only with the Attendant Report capability', () => {
    renderWithProviders(<ReportTemplatesPanel selectedStation={station} />);
    expect(screen.queryByTestId('template-card-attendantReport')).toBeTruthy();
    cleanup();
    capability = 'hidden';
    renderWithProviders(<ReportTemplatesPanel selectedStation={station} />);
    expect(screen.queryByTestId('template-card-attendantReport')).toBeNull();
  });
});

describe('Customize drawer', () => {
  it('applies a preset to the switches and the preview', () => {
    const drawer = openShiftSummary();
    fireEvent.click(within(drawer).getByRole('radio', { name: /Compact/ }));
    expect(
      (within(drawer).getByRole('switch', { name: 'Warnings' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (within(drawer).getByRole('switch', { name: 'Signatures' }) as HTMLInputElement).checked,
    ).toBe(true);
    const preview = within(drawer).getByTestId('report-preview');
    expect(
      [...preview.querySelectorAll('[data-section]')].map((e) => e.getAttribute('data-section')),
    ).toEqual(['header', 'meta', 'nozzles', 'cashRecon', 'signatures']);
    expect(
      within(drawer)
        .getByRole('radio', { name: /Compact/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('keeps the letterhead on and in place', () => {
    const drawer = openShiftSummary();
    const header = within(drawer).getByRole('switch', {
      name: 'Header / Letterhead',
    }) as HTMLInputElement;
    expect(header.checked).toBe(true);
    expect(header.disabled).toBe(true);
    expect(within(drawer).getByText('Always')).toBeTruthy();
    expect(
      within(drawer).queryByRole('button', { name: 'Move Header / Letterhead up' }),
    ).toBeNull();
    expect(
      (within(drawer).getByRole('button', { name: 'Move Shift Meta up' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(drawer).getByRole('button', { name: 'Move Signatures down' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('highlights the section in the preview when its row is hovered, and back', () => {
    const drawer = openShiftSummary();
    const row = drawer.querySelector('[data-row="nozzles"]') as HTMLElement;
    const section = within(drawer)
      .getByTestId('report-preview')
      .querySelector('[data-section="nozzles"]') as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(section.className).toMatch('ring-brand');
    fireEvent.mouseLeave(row);
    fireEvent.mouseEnter(section);
    expect(row.className).toMatch('bg-brand/10');
  });

  it('shows unsaved changes and saves the enabled sections in order', async () => {
    const drawer = openShiftSummary();
    expect(within(drawer).queryByText('Unsaved changes')).toBeNull();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Move Shift Meta down' }));
    fireEvent.click(within(drawer).getByRole('switch', { name: 'Drawers (per attendant)' }));
    expect(within(drawer).getByText('Unsaved changes')).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    });
    expect(updateStation).toHaveBeenCalledTimes(1);
    const [id, body] = updateStation.mock.calls[0];
    expect(id).toBe('st-1');
    expect(body.settings.legal).toEqual(station.settings.legal);
    expect(body.settings.report_config).toEqual({
      dssr: ['header', 'kpis'],
      shiftSummary: [
        'header',
        'warnings',
        'meta',
        'nozzles',
        'handovers',
        'terminals',
        'creditSales',
        'cashRecon',
        'signatures',
      ],
      paper: 'A4',
      showLogo: true,
    });
    await waitFor(() => expect(within(drawer).queryByText('Unsaved changes')).toBeNull());
  });

  it('asks before closing with unsaved changes', async () => {
    const drawer = openShiftSummary();
    fireEvent.click(within(drawer).getByRole('switch', { name: 'Warnings' }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close Drawer' }));
    await screen.findByText('Discard unsaved changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByText('Discard unsaved changes?')).toBeNull());
    expect(document.querySelector('.drawer-container')).toBeTruthy();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close Drawer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(document.querySelector('.drawer-container')).toBeNull());
    expect(updateStation).not.toHaveBeenCalled();
  });

  it('closes straight away when nothing changed', () => {
    const drawer = openShiftSummary();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close Drawer' }));
    expect(document.querySelector('.drawer-container')).toBeNull();
  });
});

describe('page settings', () => {
  it('saves the paper size for all reports straight away', async () => {
    renderWithProviders(<ReportTemplatesPanel selectedStation={station} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Letter' }));
    });
    expect(updateStation.mock.calls[0][1].settings.report_config).toEqual({
      dssr: ['header', 'kpis'],
      paper: 'LETTER',
      showLogo: true,
    });
  });

  it('browsing the paper sizes with the arrows saves nothing and keeps the focus', async () => {
    renderWithProviders(<ReportTemplatesPanel selectedStation={station} />);
    screen.getByRole('radio', { name: 'A4' }).focus();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Paper size' }), {
        key: 'ArrowRight',
      });
    });
    expect(updateStation).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Letter' }));
  });
});
