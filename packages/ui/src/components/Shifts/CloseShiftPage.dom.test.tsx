// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { muteExpectedConsoleErrors, renderWithProviders } from '../../test/renderWithProviders.js';
import { CloseShiftPage, type CloseShiftPageProps, type CloseStep } from './CloseShiftPage.js';
import {
  EMPTY_CLOSE_DRAFT,
  closeDrawerRows,
  closeDrawerTotal,
  type CloseDraft,
} from './closeShiftModel.js';
import { IDEMPOTENCY_KEY_REUSED } from '@pump/shared';
import { DrawerReconciliationTable } from './DrawerReconciliationTable.js';

/**
 * The Close shift page (#534): the old wizard's checks and figures on a page
 * with a step rail and a sticky footer. These pin what the operator reads at
 * each step and what gates the close; ShiftsManagement's tests pin the route,
 * the draft across a reload and the API call.
 */

const drawer = (id: string, du: string, handed: number | null, variance: number | null) => ({
  attendantId: id,
  attendantName: id === 'u1' ? 'Ravi' : 'Suresh',
  duId: du,
  duName: du.toUpperCase(),
  openingFloat: 1000,
  cashSales: handed == null ? null : 4000,
  cashDrops: 0,
  expectedCash: handed == null ? null : 5000,
  cashHandedOver: handed,
  variance,
});
const assignments = [
  { userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1' },
  { userId: 'u2', userName: 'Suresh', duId: 'du2', duCode: 'DU2' },
];
const rowsFor = (drawers: ReturnType<typeof drawer>[]) =>
  closeDrawerRows({ drawers, assignments, handovers: [] });

const ALL_HANDED = rowsFor([drawer('u1', 'du1', 5000, 0), drawer('u2', 'du2', 4880, -120)]);

const baseProps = (over: Partial<CloseShiftPageProps> = {}): CloseShiftPageProps => {
  const drawerRows = over.drawerRows ?? ALL_HANDED;
  return {
    shift: {
      id: 'sh-1',
      templateName: 'Evening',
      businessDate: '2026-10-14',
      openedAt: '2026-10-14T08:30:00.000Z',
      openedByName: 'Anita',
    },
    currentBusinessDate: '2026-10-14',
    timeZone: 'Asia/Kolkata',
    step: 'readings',
    onStepChange: vi.fn(),
    onBack: vi.fn(),
    groups: [],
    readingErrors: [],
    tanks: [{ id: 'tk1', name: 'Tank 1', productName: 'Petrol' }],
    drawerRows,
    drawerTotal: closeDrawerTotal(drawerRows),
    onOpenHandover: vi.fn(),
    cashLines: {
      openingFloats: 2000,
      cashDeclared: 8000,
      handoverDrops: 0,
      unassignedCloseDrops: 0,
      expectedOfficeCash: 10_000,
    },
    productCashOutside: 0,
    productCashBreakdown: [],
    dropDrawers: [
      { attendantId: 'u1', duId: 'du1', label: 'DU1 · Ravi' },
      { attendantId: 'u2', duId: 'du2', label: 'DU2 · Suresh' },
    ],
    canRecordDrops: true,
    draft: EMPTY_CLOSE_DRAFT,
    onDraftChange: vi.fn(),
    hasHandovers: true,
    attendantVariance: -120,
    warnings: [],
    confirmWarningsChecked: false,
    onConfirmWarningsChange: vi.fn(),
    isClosing: false,
    onConfirmClose: vi.fn(),
    ...over,
  };
};

/** The page with its draft and step held, as ShiftsManagement holds them. */
function Stateful(props: Partial<CloseShiftPageProps> & { initialDraft?: CloseDraft }) {
  const { initialDraft, ...over } = props;
  const [draft, setDraft] = useState<CloseDraft>(initialDraft ?? EMPTY_CLOSE_DRAFT);
  const [step, setStep] = useState<CloseStep>(over.step ?? 'readings');
  const [ack, setAck] = useState(false);
  return (
    <CloseShiftPage
      {...baseProps(over)}
      step={step}
      onStepChange={setStep}
      draft={draft}
      onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      confirmWarningsChecked={ack}
      onConfirmWarningsChange={setAck}
    />
  );
}

const footer = () => screen.getByRole('contentinfo', { name: 'Close shift' });
const counted = () =>
  screen.getByLabelText('Counted office cash (float + deposited)') as HTMLInputElement;
const officeVariance = () => screen.getByTestId('office-count-variance');
const closeButton = () =>
  screen.getByRole('button', { name: /^Close shift$/ }) as HTMLButtonElement;

let restoreConsole: () => void;
beforeEach(() => {
  restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/]);
});
afterEach(() => {
  cleanup();
  restoreConsole();
  vi.restoreAllMocks();
});

describe('Close shift page (#534)', () => {
  it('is a page titled for the shift, with a back link to Live shift top-left', () => {
    const onBack = vi.fn();
    renderWithProviders(<CloseShiftPage {...baseProps({ onBack })} />);
    expect(screen.getByRole('heading', { name: 'Close Evening' })).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: 'Back to Live shift' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('walks the rail Readings → Handovers → Cash count → Confirm', () => {
    renderWithProviders(<Stateful />);
    const rail = screen.getByRole('list', { name: 'Close shift steps' });
    expect(within(rail).getByRole('button', { current: 'step' }).textContent).toMatch(/Readings/);
    for (const [label, next] of [
      ['Step 1 of 4', 'Handovers'],
      ['Step 2 of 4', 'Cash count'],
      ['Step 3 of 4', 'Confirm'],
    ]) {
      expect(within(footer()).getByText(label)).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(within(rail).getByRole('button', { current: 'step' }).textContent).toMatch(next);
    }
    // A step can be opened from the rail too.
    fireEvent.click(within(rail).getByRole('button', { name: /Handovers/ }));
    expect(within(rail).getByRole('button', { current: 'step' }).textContent).toMatch(/Handovers/);
  });

  it('leaves from the first step with Cancel, keeping the draft', () => {
    const onBack = vi.fn();
    const onDraftChange = vi.fn();
    renderWithProviders(<CloseShiftPage {...baseProps({ onBack, onDraftChange })} />);
    fireEvent.click(within(footer()).getByRole('button', { name: 'Cancel' }));
    expect(onBack).toHaveBeenCalled();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('shows an error with Retry, not empty figures, when the tanks or transactions fail', () => {
    const refetch = vi.fn();
    renderWithProviders(
      <CloseShiftPage
        {...baseProps({
          queries: [
            { isPending: false, isError: false, fetchStatus: 'idle' },
            {
              isPending: false,
              isError: true,
              fetchStatus: 'idle',
              error: new Error('x'),
              refetch,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/Couldn.t load close figures/)).toBeDefined();
    expect(screen.queryByRole('contentinfo', { name: 'Close shift' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(refetch).toHaveBeenCalled();
  });

  describe('the sticky footer', () => {
    // #603: at the end of the scroll the last section cleared the footer.
    it('leaves room under the steps for the footer', () => {
      renderWithProviders(<Stateful />);
      expect(screen.getByTestId('close-shift-steps').className).toContain('pb-16');
    });

    it('shows expected and counted office cash, and the variance once counted', () => {
      renderWithProviders(<Stateful />);
      expect(within(footer()).getByText('₹10,000.00')).toBeDefined();
      expect(within(footer()).getByText('Not counted yet')).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.change(counted(), { target: { value: '9800' } });
      expect(within(footer()).getByText('₹9,800.00')).toBeDefined();
      expect(within(footer()).getByText('−₹200.00')).toBeDefined();
    });
  });

  describe('cash count', () => {
    const atCash = (initialDraft?: CloseDraft) =>
      renderWithProviders(<Stateful step="cash" initialDraft={initialDraft} />);

    it('reports a shortage, a surplus, and Balanced only on an exact count', () => {
      atCash();
      fireEvent.change(counted(), { target: { value: '9800' } });
      expect(officeVariance().getAttribute('data-state')).toBe('short');
      expect(within(officeVariance()).getByText('−₹200.00')).toBeDefined();
      fireEvent.change(counted(), { target: { value: '10200' } });
      expect(officeVariance().getAttribute('data-state')).toBe('surplus');
      expect(within(officeVariance()).getByText('+₹200.00')).toBeDefined();
      fireEvent.change(counted(), { target: { value: '10000' } });
      expect(within(officeVariance()).getByText('Balanced')).toBeDefined();
    });

    it('lists the lines that add up to the expected office cash, in plain ink', () => {
      renderWithProviders(
        <CloseShiftPage
          {...baseProps({
            step: 'cash',
            cashLines: {
              openingFloats: 2000,
              cashDeclared: 8000,
              handoverDrops: 500,
              unassignedCloseDrops: 300,
              expectedOfficeCash: 9200,
            },
            productCashOutside: 250,
          })}
        />,
      );
      const card = screen.getByRole('region', { name: 'Expected office cash' });
      expect(within(card).getByText('+₹8,000.00')).toBeDefined();
      expect(within(card).getByText('−₹500.00')).toBeDefined();
      expect(within(card).getByText('−₹300.00')).toBeDefined();
      expect(within(card).getByText('incl. product sales cash not on a drawer')).toBeDefined();
      expect(card.textContent).not.toMatch(/merchandise/i);
    });

    it('applies the denomination count as the counted cash, and keeps it across steps', () => {
      atCash();
      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));
      fireEvent.change(screen.getByLabelText('Count of ₹500'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('Count of ₹100'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }));
      expect(counted().value).toBe('1700');
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));
      expect((screen.getByLabelText('Count of ₹500') as HTMLInputElement).value).toBe('3');
    });

    it('refuses a fractional or negative denomination count inline, never flooring it', () => {
      atCash();
      fireEvent.click(screen.getByRole('button', { name: 'Count safe cash by denomination' }));
      const count = () => screen.getByLabelText('Count of ₹500') as HTMLInputElement;
      fireEvent.change(count(), { target: { value: '2.5' } });
      expect(screen.getByRole('alert').textContent).toBe(
        'Enter a whole number of notes, zero or more.',
      );
      expect(count().value).toBe('2.5');
      expect(count().getAttribute('aria-invalid')).toBe('true');
      const apply = () => screen.getByRole('button', { name: /^Apply/ }) as HTMLButtonElement;
      expect(apply().disabled).toBe(true);
      expect(apply().textContent).toContain('₹0.00');
      fireEvent.change(count(), { target: { value: '-1' } });
      expect(apply().disabled).toBe(true);
      fireEvent.change(count(), { target: { value: '3' } });
      expect(apply().disabled).toBe(false);
      fireEvent.click(apply());
      expect(counted().value).toBe('1500');
    });

    it('adds a drop at close naming the first drawer, which can name none', () => {
      atCash();
      fireEvent.click(screen.getByRole('button', { name: 'Add drop' }));
      const select = screen.getByLabelText('Drop from drawer') as HTMLSelectElement;
      expect(select.value).toBe('u1|du1');
      fireEvent.change(select, { target: { value: '' } });
      expect(select.value).toBe('');
      fireEvent.click(screen.getByRole('button', { name: 'Remove drop' }));
      expect(screen.queryByLabelText('Drop from drawer')).toBeNull();
    });

    it('explains a variance on request', () => {
      atCash({ ...EMPTY_CLOSE_DRAFT, closingCash: 9000 });
      fireEvent.click(screen.getByRole('button', { name: 'Why might this happen?' }));
      expect(screen.getByText(/not yet recorded as a cash drop/)).toBeDefined();
    });
  });

  describe('handovers', () => {
    it('lists every drawer with its variance, and a total that says what it leaves out', () => {
      const rows = rowsFor([drawer('u1', 'du1', 5120, 120), drawer('u2', 'du2', null, null)]);
      const onOpenHandover = vi.fn();
      renderWithProviders(
        <CloseShiftPage
          {...baseProps({
            step: 'handovers',
            drawerRows: rows,
            drawerTotal: closeDrawerTotal(rows),
            onOpenHandover,
          })}
        />,
      );
      expect(screen.getByText('Total excl. DU2, not handed over')).toBeDefined();
      expect(screen.getByRole('alert').textContent).toMatch(/1 drawer has not handed over/);
      // A missing handover opens the Handover drawer from here.
      fireEvent.click(screen.getByRole('button', { name: /Record DU2 · Suresh handover/ }));
      expect(onOpenHandover).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2' }));
    });
  });

  it('reads the drawers’ variance total as a chip, with the one balanced rule (#534 review)', () => {
    const drawers = [drawer('u1', 'du1', 5000, 0.004), drawer('u2', 'du2', 5000, -0.004)];
    const { container } = renderWithProviders(
      <DrawerReconciliationTable drawers={drawers} showTotals />,
    );
    const foot = container.querySelector('tfoot')!;
    expect(within(foot as HTMLElement).getByText('Balanced')).toBeDefined();
    cleanup();
    const short = [drawer('u1', 'du1', 4880, -120)];
    const again = renderWithProviders(<DrawerReconciliationTable drawers={short} showTotals />);
    const total = again.container.querySelector('tfoot [data-variance]')!;
    expect(total.getAttribute('data-variance')).toBe('short');
    expect(total.textContent).toBe('−₹120.00');
  });

  describe('confirm and submit gating', () => {
    it('blocks the close until an outstanding warning is acknowledged', () => {
      renderWithProviders(<Stateful step="confirm" warnings={['High volume alert: N1.']} />);
      expect(screen.getByText('High volume alert: N1.')).toBeDefined();
      expect(closeButton().disabled).toBe(true);
      expect(screen.getByText('Pending')).toBeDefined();
      fireEvent.click(screen.getByLabelText(/I confirm these readings are correct/));
      expect(closeButton().disabled).toBe(false);
      expect(screen.getByText('Yes')).toBeDefined();
    });

    it('blocks the close while a drawer has not handed over', () => {
      const rows = rowsFor([drawer('u1', 'du1', 5000, 0), drawer('u2', 'du2', null, null)]);
      renderWithProviders(
        <CloseShiftPage
          {...baseProps({ step: 'confirm', drawerRows: rows, drawerTotal: closeDrawerTotal(rows) })}
        />,
      );
      expect(screen.getByRole('alert').textContent).toMatch(/Hand over every drawer/);
      expect(closeButton().disabled).toBe(true);
    });

    it('blocks the close while a closing reading is below its opening', () => {
      renderWithProviders(
        <CloseShiftPage {...baseProps({ step: 'confirm', readingErrors: ['N1 is below'] })} />,
      );
      expect(closeButton().disabled).toBe(true);
    });

    it('waits for a Handover’s figures: every dependent figure Saving…, no close yet (#606)', () => {
      renderWithProviders(<CloseShiftPage {...baseProps({ step: 'confirm', money: 'saving' })} />);
      expect(within(footer()).getByText('Saving…')).toBeDefined();
      expect(within(footer()).queryByText('₹10,000.00')).toBeNull();
      const summary = screen.getByRole('region', { name: 'Shift summary' });
      expect(within(summary).getAllByText('Saving…')).toHaveLength(2);
      expect(closeButton().disabled).toBe(true);
      expect(screen.queryByTestId('unconfirmed-totals')).toBeNull();
    });

    it('holds the cash count’s expected figures as Saving… too (#606)', () => {
      renderWithProviders(<CloseShiftPage {...baseProps({ step: 'cash', money: 'saving' })} />);
      const card = screen.getByRole('region', { name: 'Expected office cash' });
      expect(within(card).getAllByText('Saving…').length).toBeGreaterThanOrEqual(2);
      expect(within(officeVariance()).getByText('Saving…')).toBeDefined();
    });

    it('a failed confirmation keeps Close disabled with an inline Retry; confirmed enables it', () => {
      const onRetryMoney = vi.fn();
      const { rerender } = renderWithProviders(
        <CloseShiftPage {...baseProps({ step: 'confirm', money: 'unconfirmed', onRetryMoney })} />,
      );
      const note = screen.getByTestId('unconfirmed-totals');
      expect(note.textContent).toContain("Couldn't confirm the drawer totals");
      fireEvent.click(within(note).getByRole('button', { name: 'Retry' }));
      expect(onRetryMoney).toHaveBeenCalledTimes(1);
      expect(closeButton().disabled).toBe(true);

      rerender(<CloseShiftPage {...baseProps({ step: 'confirm', money: 'confirmed' })} />);
      expect(screen.queryByTestId('unconfirmed-totals')).toBeNull();
      expect(closeButton().disabled).toBe(false);
    });

    it('marks a Drawer Saving… while its Handover saves, and says why one was refused (#606)', () => {
      const writes = new Map([
        [
          'u1|du1',
          { state: 'saving' as const, variables: {} as never, error: null, submittedAt: 1 },
        ],
        [
          'u2|du2',
          {
            state: 'failed' as const,
            variables: {} as never,
            error: new Error('Shift is closed'),
            submittedAt: 1,
          },
        ],
      ]);
      renderWithProviders(
        <CloseShiftPage {...baseProps({ step: 'handovers', handoverWrites: writes })} />,
      );
      const row = (label: string) => screen.getByText(label).closest('tr') as HTMLElement;
      expect(within(row('DU1 · Ravi')).getByText('Saving…')).toBeDefined();
      expect(within(row('DU2 · Suresh')).getByRole('alert').textContent).toContain(
        'Shift is closed',
      );
    });

    it('closes when nothing is outstanding, and shows progress while it runs', () => {
      const onConfirmClose = vi.fn();
      const { rerender } = renderWithProviders(
        <CloseShiftPage {...baseProps({ step: 'confirm', onConfirmClose })} />,
      );
      expect(screen.getByText('No warnings. Safe to proceed.')).toBeDefined();
      fireEvent.click(closeButton());
      expect(onConfirmClose).toHaveBeenCalledWith(expect.any(Function));
      rerender(<CloseShiftPage {...baseProps({ step: 'confirm', isClosing: true })} />);
      const busy = screen.getByRole('button', { name: /Closing shift/ }) as HTMLButtonElement;
      expect(busy.disabled).toBe(true);
    });

    it('hands the close one Idempotency-Key for the page: an edited retry reuses it', async () => {
      const onConfirmClose = vi.fn();
      renderWithProviders(<CloseShiftPage {...baseProps({ step: 'confirm', onConfirmClose })} />);
      fireEvent.click(closeButton());
      fireEvent.click(closeButton());
      const [[save1], [save2]] = onConfirmClose.mock.calls;
      const keys: string[] = [];
      const lost = Object.assign(new Error('Network down'), { status: undefined });
      await save1({ closingCash: 1 }, async (k: string) => {
        keys.push(k);
        throw lost;
      }).catch(() => undefined);
      const conflict = Object.assign(new Error('Edited retry'), {
        status: 409,
        code: IDEMPOTENCY_KEY_REUSED,
      });
      await save2({ closingCash: 2 }, async (k: string) => {
        keys.push(k);
        throw conflict;
      }).catch(() => undefined);
      expect(keys[1]).toBe(keys[0]);
    });
  });

  describe('readings and tank dips', () => {
    it('says a pending drawer’s readings come with its handover', () => {
      renderWithProviders(
        <CloseShiftPage
          {...baseProps({
            groups: [
              {
                key: 'u2|du2',
                label: 'DU2 · Suresh',
                du: 'DU2',
                assignment: assignments[1],
                handover: null,
                status: 'handover-pending',
                rows: [],
              },
            ],
          })}
        />,
      );
      expect(screen.getByText(/DU2 readings come in with its handover/)).toBeDefined();
    });

    it('takes dips per tank, and counts the ones entered', () => {
      renderWithProviders(<Stateful />);
      fireEvent.click(screen.getByLabelText('I recorded physical dip readings this shift'));
      fireEvent.change(screen.getByLabelText('Tank 1 dip, litres'), { target: { value: '12400' } });
      fireEvent.change(screen.getByLabelText('Tank 1 dip reason'), {
        target: { value: 'Morning' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
      const summary = screen.getByRole('region', { name: 'Shift summary' });
      expect(within(summary).getByText('Tank dips captured').nextElementSibling?.textContent).toBe(
        '1',
      );
    });

    it('discards entered dips only when the operator confirms', async () => {
      renderWithProviders(<Stateful />);
      const toggle = screen.getByLabelText('I recorded physical dip readings this shift');
      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText('Tank 1 dip, litres'), { target: { value: '100' } });
      fireEvent.click(toggle);
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: /cancel/i }),
      );
      await waitFor(() =>
        expect((screen.getByLabelText('Tank 1 dip, litres') as HTMLInputElement).value).toBe('100'),
      );
      fireEvent.click(toggle);
      fireEvent.click(await screen.findByRole('button', { name: 'Discard tank dips' }));
      await waitFor(() => expect(screen.queryByLabelText('Tank 1 dip, litres')).toBeNull());
    });
  });
});
