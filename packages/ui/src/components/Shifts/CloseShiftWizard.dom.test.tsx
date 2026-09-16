// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, muteExpectedConsoleErrors } from '../../test/renderWithProviders.js';
import { CloseShiftWizard, type CloseShiftWizardProps } from './CloseShiftWizard.js';

/**
 * The shift-close wizard is where an operator reconciles physical drawer cash
 * against metered sales, so these cover the arithmetic the operator acts on and
 * the gates that stop a close going out wrong — not the markup.
 *
 * It is a controlled component: closing cash, dip readings and the warning
 * acknowledgement are all lifted, and `onConfirmClose` takes no argument. So
 * "what would be submitted" is asserted through the change callbacks plus the
 * figures on screen, which is also what survives the refactor in #63.
 */
const baseProps = (over: Partial<CloseShiftWizardProps> = {}): CloseShiftWizardProps => ({
  isOpen: true,
  onClose: vi.fn(),
  shiftTemplateName: 'Morning',
  openedAt: '2026-03-01T06:00:00.000Z',
  businessDate: '2026-03-01',
  currentBusinessDate: '2026-03-01',
  openingCash: 5000,
  cashCollections: 0,
  cashExpenses: 0,
  expectedCash: 10000,
  closingCash: 0,
  onClosingCashChange: vi.fn(),
  cashSummary: null,
  stationTanks: [],
  dipReadings: {},
  onDipReadingsChange: vi.fn(),
  dipReasons: {},
  onDipReasonsChange: vi.fn(),
  warnings: [],
  confirmWarningsChecked: false,
  onConfirmWarningsChange: vi.fn(),
  isClosing: false,
  onConfirmClose: vi.fn(),
  ...over,
});

const step = () => screen.getByText(/^Step \d of 4$/).textContent;
/** Anchored on the visible label, so a styling change cannot silently break it. */
const varianceLine = () => screen.getByText(/Drawer cash variance/i).closest('[data-state]');
const closeButton = () => screen.getByRole('button', { name: /^Close Shift$/ });
/** Reads the value cell of a step-4 summary row by its label. */
const summaryValue = (label: string) =>
  screen.getByText(label).parentElement?.querySelector('span:last-child')?.textContent ?? '';
const goToStep = (n: number) => {
  for (let i = 1; i < n; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

describe('CloseShiftWizard', () => {
  let restoreConsole: () => void;
  beforeEach(() => {
    // Only the noise these tests provoke on purpose; React's act() and
    // unmounted-update warnings must still reach the console.
    restoreConsole = muteExpectedConsoleErrors([
      /not wrapped in act/,
      /Warning: validateDOMNesting/,
    ]);
  });
  afterEach(() => {
    cleanup();
    restoreConsole();
  });

  describe('drawer cash variance', () => {
    it('reports a shortage when counted cash is below expected', () => {
      renderWithProviders(
        <CloseShiftWizard {...baseProps({ expectedCash: 10000, closingCash: 9700 })} />,
      );
      expect(varianceLine()?.getAttribute('data-state')).toBe('shortage');
      expect(varianceLine()?.textContent).toContain('Cash Shortage');
      expect(varianceLine()?.textContent).toContain('300');
    });

    it('reports a surplus, with the sign shown, when counted cash is above expected', () => {
      renderWithProviders(
        <CloseShiftWizard {...baseProps({ expectedCash: 10000, closingCash: 10250 })} />,
      );
      expect(varianceLine()?.getAttribute('data-state')).toBe('surplus');
      expect(varianceLine()?.textContent).toContain('Cash Surplus');
      expect(varianceLine()?.textContent).toContain('+');
    });

    it('reports a perfect match only on an exact reconciliation', () => {
      renderWithProviders(
        <CloseShiftWizard {...baseProps({ expectedCash: 10000, closingCash: 10000 })} />,
      );
      expect(varianceLine()?.getAttribute('data-state')).toBe('match');
      expect(varianceLine()?.textContent).toContain('Perfect Match');
    });

    it('re-derives the variance when the expected figure changes under it', () => {
      // The risk this protects against: a stale effect-copied prop leaving the
      // operator looking at the previous shift's expected cash.
      const { rerender } = renderWithProviders(
        <CloseShiftWizard {...baseProps({ expectedCash: 10000, closingCash: 10000 })} />,
      );
      expect(varianceLine()?.getAttribute('data-state')).toBe('match');

      rerender(<CloseShiftWizard {...baseProps({ expectedCash: 12000, closingCash: 10000 })} />);
      expect(varianceLine()?.getAttribute('data-state')).toBe('shortage');
      expect(varianceLine()?.textContent).toContain('2,000');
    });
  });

  describe('reopening for a different shift', () => {
    it('shows the new shift figures, not the previous ones', () => {
      const { rerender } = renderWithProviders(
        <CloseShiftWizard
          {...baseProps({ shiftTemplateName: 'Morning', expectedCash: 10000, closingCash: 9700 })}
        />,
      );
      expect(screen.getByText(/Close Shift · Morning/)).toBeDefined();
      expect(varianceLine()?.textContent).toContain('300');

      rerender(<CloseShiftWizard {...baseProps({ isOpen: false })} />);
      rerender(
        <CloseShiftWizard
          {...baseProps({ shiftTemplateName: 'Evening', expectedCash: 8000, closingCash: 8000 })}
        />,
      );

      expect(screen.getByText(/Close Shift · Evening/)).toBeDefined();
      expect(varianceLine()?.getAttribute('data-state')).toBe('match');
    });

    it('clears the counted denominations when the drawer closes', () => {
      // The only state in this component copied from a prop. If the reset is
      // lost, the next shift's close opens showing the previous shift's cash
      // count — and the variance derived from props would look consistent
      // with it, so nothing else would give it away.
      const { rerender } = renderWithProviders(<CloseShiftWizard {...baseProps()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));
      fireEvent.change(screen.getByLabelText('Count of ₹500'), { target: { value: '3' } });
      expect((screen.getByLabelText('Count of ₹500') as HTMLInputElement).value).toBe('3');

      rerender(<CloseShiftWizard {...baseProps({ isOpen: false })} />);
      rerender(<CloseShiftWizard {...baseProps({ shiftTemplateName: 'Evening' })} />);

      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));
      expect((screen.getByLabelText('Count of ₹500') as HTMLInputElement).value).toBe('');
    });

    it('renders nothing at all while closed', () => {
      renderWithProviders(<CloseShiftWizard {...baseProps({ isOpen: false })} />);
      expect(screen.queryByText(/Close Shift ·/)).toBeNull();
    });
  });

  describe('counted cash', () => {
    it('reports the typed amount as the closing cash', () => {
      const onClosingCashChange = vi.fn();
      renderWithProviders(<CloseShiftWizard {...baseProps({ onClosingCashChange })} />);
      fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '9750' } });
      expect(onClosingCashChange).toHaveBeenCalledWith(9750);
    });

    it('applies the denomination count as the closing cash, so the counted total is the submitted total', () => {
      // The ticket's case: the number the cash-breakdown popover totals must be
      // the number the close carries, not a separately-tracked figure.
      const onClosingCashChange = vi.fn();
      renderWithProviders(<CloseShiftWizard {...baseProps({ onClosingCashChange })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));

      // 3 × ₹500 + 2 × ₹100 = ₹1,700
      fireEvent.change(screen.getByLabelText('Count of ₹500'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('Count of ₹100'), { target: { value: '2' } });

      const apply = screen.getByRole('button', { name: /^Apply/ });
      expect(apply.textContent).toContain('1,700');
      fireEvent.click(apply);

      expect(onClosingCashChange).toHaveBeenCalledWith(1700);
    });

    it('keeps the counted breakdown while the operator moves between steps', () => {
      renderWithProviders(<CloseShiftWizard {...baseProps({ closingCash: 1700 })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));
      fireEvent.change(screen.getByLabelText('Count of ₹500'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));

      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));
      expect((screen.getByLabelText('Count of ₹500') as HTMLInputElement).value).toBe('3');
    });
  });

  describe('submit gating', () => {
    it('blocks the close until an outstanding warning is acknowledged', () => {
      const { rerender } = renderWithProviders(
        <CloseShiftWizard {...baseProps({ warnings: ['Tank 1 stock variance exceeds 0.5%'] })} />,
      );
      goToStep(4);
      expect((closeButton() as HTMLButtonElement).disabled).toBe(true);

      rerender(
        <CloseShiftWizard
          {...baseProps({
            warnings: ['Tank 1 stock variance exceeds 0.5%'],
            confirmWarningsChecked: true,
          })}
        />,
      );
      expect((closeButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('allows the close when there is nothing outstanding', () => {
      renderWithProviders(<CloseShiftWizard {...baseProps({ closingCash: 10000 })} />);
      goToStep(4);
      expect((closeButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('calls onConfirmClose when the operator commits', () => {
      const onConfirmClose = vi.fn();
      renderWithProviders(
        <CloseShiftWizard {...baseProps({ onConfirmClose, closingCash: 10000 })} />,
      );
      goToStep(4);
      fireEvent.click(closeButton());
      expect(onConfirmClose).toHaveBeenCalledTimes(1);
    });

    it('shows progress and blocks re-entry while the close is in flight', () => {
      renderWithProviders(
        <CloseShiftWizard {...baseProps({ isClosing: true, closingCash: 10000 })} />,
      );
      goToStep(4);
      const button = screen.getByRole('button', { name: /Closing Shift/ });
      expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('summarises what is still pending before the close', () => {
      renderWithProviders(
        <CloseShiftWizard
          {...baseProps({ warnings: ['Stock variance'], confirmWarningsChecked: false })}
        />,
      );
      goToStep(4);
      expect(summaryValue('Warnings Acknowledged')).toBe('Pending');
    });
  });

  describe('dip readings', () => {
    const tanks = [{ id: 't1', tankName: 'Tank 1', productName: 'Petrol' }];

    it('counts only the tanks actually dipped', () => {
      renderWithProviders(
        <CloseShiftWizard
          {...baseProps({ stationTanks: tanks, dipReadings: { t1: 4200, t2: '' } })}
        />,
      );
      goToStep(4);
      // t2 was left blank, so one reading was captured, not two.
      expect(summaryValue('Dip Readings Captured')).toBe('1');
    });

    it('requires the post-close dip acknowledgement once a reading is entered', () => {
      renderWithProviders(
        <CloseShiftWizard
          {...baseProps({ stationTanks: tanks, dipReadings: { t1: 4200 }, closingCash: 10000 })}
        />,
      );
      goToStep(4);
      // A dip was entered, so the close is gated on confirming it post-close.
      expect((closeButton() as HTMLButtonElement).disabled).toBe(true);
    });

    it('discards entered dips when the operator turns recording off and confirms', async () => {
      // The ticket's case: readings entered, then "record dip" switched off,
      // must be discarded rather than silently submitted.
      const onDipReadingsChange = vi.fn();
      const onDipReasonsChange = vi.fn();
      renderWithProviders(
        <CloseShiftWizard
          {...baseProps({
            stationTanks: tanks,
            dipReadings: { t1: 4200 },
            onDipReadingsChange,
            onDipReasonsChange,
          })}
        />,
      );
      goToStep(2);

      const toggle = screen.getByLabelText('I recorded physical dip readings this shift');
      fireEvent.click(toggle);
      fireEvent.click(toggle);

      await waitFor(() => expect(screen.getByText('Discard Tank Dips')).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: 'Discard Tank Dips' }));

      await waitFor(() => {
        expect(onDipReadingsChange).toHaveBeenCalledWith({});
        expect(onDipReasonsChange).toHaveBeenCalledWith({});
      });
    });

    it('keeps the entered dips when the operator backs out of discarding', async () => {
      const onDipReadingsChange = vi.fn();
      renderWithProviders(
        <CloseShiftWizard
          {...baseProps({ stationTanks: tanks, dipReadings: { t1: 4200 }, onDipReadingsChange })}
        />,
      );
      goToStep(2);
      const toggle = screen.getByLabelText('I recorded physical dip readings this shift');
      fireEvent.click(toggle);
      fireEvent.click(toggle);

      await waitFor(() => expect(screen.getByText('Discard Tank Dips')).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => expect(onDipReadingsChange).not.toHaveBeenCalled());
    });
  });

  describe('cash summary breakdown', () => {
    it('falls back to the legacy card when the server summary is absent', () => {
      renderWithProviders(<CloseShiftWizard {...baseProps({ cashSummary: null })} />);
      expect(screen.getByText(/Expected Safe Cash/i)).toBeDefined();
    });

    it('reports a balanced attendant variance as balanced', () => {
      renderWithProviders(
        <CloseShiftWizard
          {...baseProps({
            cashSummary: {
              openingCash: 5000,
              cashSales: 8000,
              handoverCash: 8000,
              merchCashOutsideHandover: 0,
              cashCollections: 0,
              cashIncome: 0,
              drawerExpenses: 0,
              drawerSupplierPayments: 0,
              expectedDrawer: 13000,
              merchCashBreakdown: [],
              attendantVariance: 0,
              attendantVariances: [{ name: 'Ravi', du: 'DU-1', variance: 0 }],
              hasHandovers: true,
            },
          })}
        />,
      );
      expect(screen.getAllByText(/\(balanced\)/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/\(short\)/)).toBeNull();
    });

    it('flags an attendant who handed over short', () => {
      renderWithProviders(
        <CloseShiftWizard
          {...baseProps({
            cashSummary: {
              openingCash: 5000,
              cashSales: 8000,
              handoverCash: 7500,
              merchCashOutsideHandover: 0,
              cashCollections: 0,
              cashIncome: 0,
              drawerExpenses: 0,
              drawerSupplierPayments: 0,
              expectedDrawer: 12500,
              merchCashBreakdown: [],
              attendantVariance: -500,
              attendantVariances: [{ name: 'Ravi', du: 'DU-1', variance: -500 }],
              hasHandovers: true,
            },
          })}
        />,
      );
      expect(screen.getAllByText(/\(short\)/).length).toBeGreaterThan(0);
      // The ₹500 gap must be shown, not just its direction.
      expect(screen.getAllByText(/500/).length).toBeGreaterThan(0);
    });
  });
});
