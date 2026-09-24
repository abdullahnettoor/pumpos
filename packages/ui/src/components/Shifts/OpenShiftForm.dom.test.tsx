// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  renderWithProviders,
  createTestQueryClient,
  muteExpectedConsoleErrors,
} from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { OpenShiftForm } from './OpenShiftForm.js';

/**
 * Opening a shift against the wrong business day is unrecoverable without an
 * admin correction: every sale, expense and reading for the next several hours
 * anchors to it. So these cover the gate, not the layout — which business-day
 * states permit an open, and which silently must not.
 *
 * The business-day status is seeded into the query cache rather than mocked at
 * the service, so the component exercises its real hook.
 */
const STATION = 'station-1';
const TODAY = '2026-03-01';

const seedStatus = (
  client: ReturnType<typeof createTestQueryClient>,
  businessDate: string,
  data: unknown,
) => client.setQueryData(queryKeys.businessDayStatus(STATION, businessDate), data);

/* eslint-disable @typescript-eslint/no-explicit-any */
const baseProps = (over: Record<string, unknown> = {}): any =>
  ({
    lastShiftSummary: null,
    lastShift: null,
    stationId: STATION,
    templates: [{ id: 'tpl-1', name: 'Morning', startTime: '06:00', endTime: '14:00' }],
    dispensers: [],
    staff: [],
    nozzles: [],
    terminals: [],
    terminalAssignments: [],
    onTerminalAssignmentChange: vi.fn(),
    selectedTemplateId: 'tpl-1',
    businessDate: TODAY,
    currentBusinessDate: TODAY,
    staffAssignments: [],
    onStaffAssignmentChange: vi.fn(),
    onOpeningFloatChange: vi.fn(),
    initialReadings: [],
    onInitialReadingChange: vi.fn(),
    isOpening: false,
    onSubmit: vi.fn(),
    onViewLastShiftSummary: vi.fn(),
    ...over,
  }) as any;

const openButton = () =>
  screen.getByRole('button', { name: /Start Shift Operations/i }) as HTMLButtonElement;

const renderForm = (
  props: Record<string, unknown> = {},
  status: unknown = { requestedState: 'OPEN', openBusinessDays: [] },
  statusDate = TODAY,
) => {
  const client = createTestQueryClient();
  seedStatus(client, statusDate, status);
  return renderWithProviders(<OpenShiftForm {...baseProps(props)} />, { queryClient: client });
};

describe('OpenShiftForm', () => {
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

  it('renders the no-active-shift state', () => {
    renderForm();
    expect(screen.getByText('No active shift')).toBeDefined();
  });

  describe('business-day gating', () => {
    it('permits opening against an open business day', async () => {
      renderForm({}, { requestedState: 'OPEN', openBusinessDays: [{ businessDate: TODAY }] });
      await waitFor(() => expect(openButton().disabled).toBe(false));
    });

    it('permits opening against a day that does not exist yet', async () => {
      // A fuel day is opened lazily by the first entry that lands on it.
      renderForm({}, { requestedState: 'NOT_CREATED', openBusinessDays: [] });
      await waitFor(() => expect(openButton().disabled).toBe(false));
    });

    it('refuses to open against a closed business day', async () => {
      // The DSSR for that day is already sealed; a new shift would sit behind it.
      renderForm({}, { requestedState: 'CLOSED', openBusinessDays: [] });
      await waitFor(() => expect(openButton().disabled).toBe(true));
      expect(screen.getByText(/closed/i)).toBeDefined();
    });

    it('refuses to open while the lifecycle state is still unknown', () => {
      // Nothing seeded: the query has not resolved, so the state is UNKNOWN and
      // the operator must not be able to commit on an assumption.
      const client = createTestQueryClient();
      renderWithProviders(<OpenShiftForm {...baseProps()} />, { queryClient: client });
      expect(openButton().disabled).toBe(true);
    });

    it('refuses to open when the lifecycle state could not be fetched', async () => {
      renderForm({}, { requestedState: 'UNAVAILABLE', openBusinessDays: [] });
      await waitFor(() => expect(openButton().disabled).toBe(true));
    });
  });

  describe('future business dates', () => {
    it('refuses a business date ahead of the station clock', async () => {
      renderForm(
        { businessDate: '2026-03-05', currentBusinessDate: TODAY },
        { requestedState: 'OPEN', openBusinessDays: [] },
        '2026-03-05',
      );
      await waitFor(() => expect(openButton().disabled).toBe(true));
      expect(screen.getByText(/future Business Dates cannot be used/i)).toBeDefined();
    });

    it('permits a past business date, which is how a late shift is recorded', async () => {
      renderForm(
        { businessDate: '2026-02-27', currentBusinessDate: TODAY },
        { requestedState: 'OPEN', openBusinessDays: [{ businessDate: '2026-02-27' }] },
        '2026-02-27',
      );
      await waitFor(() => expect(openButton().disabled).toBe(false));
    });
  });

  describe('submission', () => {
    it('submits the template, business date and opening cash', async () => {
      const onSubmit = vi.fn();
      renderForm(
        { onSubmit },
        { requestedState: 'OPEN', openBusinessDays: [{ businessDate: TODAY }] },
      );
      await waitFor(() => expect(openButton().disabled).toBe(false));

      fireEvent.submit(openButton().closest('form')!);
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());

      const [values] = onSubmit.mock.calls[0];
      expect(values.shiftTemplateId).toBe('tpl-1');
      expect(values.businessDate).toBe(TODAY);
      expect(values).not.toHaveProperty('openingCash');
    });

    it('re-derives the submitted business date when the prop changes', async () => {
      // Guards the effect that syncs `businessDate` into the form. A fix that
      // ran it only on mount would open the shift against the date the screen
      // first rendered with, not the one shown.
      const onSubmit = vi.fn();
      const client = createTestQueryClient();
      seedStatus(client, TODAY, {
        requestedState: 'OPEN',
        openBusinessDays: [{ businessDate: TODAY }],
      });
      seedStatus(client, '2026-02-27', {
        requestedState: 'OPEN',
        openBusinessDays: [{ businessDate: '2026-02-27' }],
      });

      const { rerender } = renderWithProviders(
        <OpenShiftForm {...baseProps({ onSubmit, businessDate: TODAY })} />,
        { queryClient: client },
      );
      await waitFor(() => expect(openButton().disabled).toBe(false));

      rerender(<OpenShiftForm {...baseProps({ onSubmit, businessDate: '2026-02-27' })} />);
      await waitFor(() => expect(openButton().disabled).toBe(false));

      fireEvent.submit(openButton().closest('form')!);
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].businessDate).toBe('2026-02-27');
    });

    it('keeps a date the operator chose when an unrelated prop change lands', async () => {
      // Deliberate change: the old setValue effect overwrote the field on every
      // prop change, so a day-start rollover could silently move a shift the
      // operator had already dated. `keepDirtyValues` leaves their choice.
      const onSubmit = vi.fn();
      const client = createTestQueryClient();
      for (const d of [TODAY, '2026-02-27']) {
        seedStatus(client, d, {
          requestedState: 'OPEN',
          openBusinessDays: [{ businessDate: d, id: d }],
        });
      }

      const { rerender } = renderWithProviders(
        <OpenShiftForm {...baseProps({ onSubmit, businessDate: TODAY })} />,
        { queryClient: client },
      );
      await waitFor(() => expect(openButton().disabled).toBe(false));

      const dateInput = document.querySelector('input[name="businessDate"]') as HTMLInputElement;
      if (dateInput) {
        fireEvent.change(dateInput, { target: { value: '2026-02-27' } });
        // An unrelated prop moves; the chosen date must survive it.
        rerender(
          <OpenShiftForm {...baseProps({ onSubmit, businessDate: TODAY, isOpening: false })} />,
        );
        await waitFor(() => expect(dateInput.value).toBe('2026-02-27'));
      }
    });

    it('re-derives the submitted template when the selection changes', async () => {
      const onSubmit = vi.fn();
      const client = createTestQueryClient();
      seedStatus(client, TODAY, {
        requestedState: 'OPEN',
        openBusinessDays: [{ businessDate: TODAY }],
      });
      const templates = [
        { id: 'tpl-1', name: 'Morning', startTime: '06:00', endTime: '14:00' },
        { id: 'tpl-2', name: 'Evening', startTime: '14:00', endTime: '22:00' },
      ];

      const { rerender } = renderWithProviders(
        <OpenShiftForm {...baseProps({ onSubmit, templates, selectedTemplateId: 'tpl-1' })} />,
        { queryClient: client },
      );
      await waitFor(() => expect(openButton().disabled).toBe(false));

      rerender(
        <OpenShiftForm {...baseProps({ onSubmit, templates, selectedTemplateId: 'tpl-2' })} />,
      );
      fireEvent.submit(openButton().closest('form')!);
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].shiftTemplateId).toBe('tpl-2');
    });

    it('blocks re-entry while the shift is being opened', async () => {
      renderForm(
        { isOpening: true },
        { requestedState: 'OPEN', openBusinessDays: [{ businessDate: TODAY }] },
      );
      await waitFor(() => expect(openButton().getAttribute('aria-busy')).toBe('true'));
    });
  });

  /**
   * The opening-readings grid. The comparator is unit-tested in
   * `@pump/shared`; what this pins is the part this surface owns — which
   * fields it hands it. Note the nozzle field here is `name`, not the
   * `nozzleName` the readings grid uses, which is exactly the asymmetry that
   * kept the cascade duplicated (#244).
   */
  describe('the order opening-reading fields are listed in (#244)', () => {
    const nozzle = (over: Record<string, unknown>) => ({
      id: String(over.name ?? 'x'),
      productCode: 'MS',
      unit: 'L',
      ...over,
    });

    const listed = (nozzles: Record<string, unknown>[]): string[] => {
      renderForm({ nozzles });
      return Array.from(document.querySelectorAll('label'))
        .map((l) => l.textContent ?? '')
        .filter((t) => t.startsWith('Nozzle '))
        .map((t) => t.replace(/^Nozzle /, '').split(' —')[0]);
    };

    it('groups by dispenser first, then orders nozzles naturally', () => {
      expect(
        listed([
          nozzle({ name: 'N10', duCode: 'DU-1' }),
          nozzle({ name: 'N1', duCode: 'DU-2' }),
          nozzle({ name: 'N2', duCode: 'DU-1' }),
        ]),
      ).toEqual(['N2', 'N10', 'N1']);
    });

    it('reads the nozzle from `name`, which is not what the readings grid calls it', () => {
      // Handing it `nozzleName` here would leave every label undefined and the
      // order arbitrary.
      expect(
        listed([nozzle({ name: 'N10', duCode: 'DU-1' }), nozzle({ name: 'N2', duCode: 'DU-1' })]),
      ).toEqual(['N2', 'N10']);
    });

    it('keys the dispenser on its code, not its name', () => {
      expect(
        listed([
          nozzle({ name: 'N1', duCode: 'DU-2', duName: 'Alpha' }),
          nozzle({ name: 'N2', duCode: 'DU-1', duName: 'Zulu' }),
        ]),
      ).toEqual(['N2', 'N1']);
    });

    it('ignores case, so a renamed nozzle does not jump the list', () => {
      // The delta #241 introduced here and never pinned.
      expect(
        listed([nozzle({ name: 'n10', duCode: 'du-1' }), nozzle({ name: 'N2', duCode: 'DU-1' })]),
      ).toEqual(['N2', 'n10']);
    });
  });

  /**
   * Assignment is DU-centric (#223). An operator's conversation is "who is on
   * pump 2 and which POS is with them", not "here are all the attendants, and
   * separately here are all the terminals". The two flat sections made that
   * mapping something the operator had to hold in their head; the cards make
   * it the shape of the form.
   *
   * The submitted payload is unchanged — `staffAssignments` and
   * `terminalLinks` were already keyed by DU on the wire, so this is a
   * presentation change, and these pin that it stayed one.
   */
  describe('per-dispenser assignment cards', () => {
    const DISPENSERS = [
      { id: 'du-1', code: 'DU-1', name: 'Pump One' },
      { id: 'du-2', code: 'DU-2', name: 'Pump Two' },
    ];
    const STAFF = [
      { id: 'u-1', fullName: 'Ravi' },
      { id: 'u-2', fullName: 'Asha' },
    ];
    const TERMINALS = [
      { id: 't-1', label: 'POS A', supportsCard: true, supportsUpi: false },
      { id: 't-2', label: 'POS B', supportsCard: true, supportsUpi: true },
      { id: 't-3', label: 'POS C', supportsCard: false, supportsUpi: true },
    ];

    const assignmentProps = (over: Record<string, unknown> = {}) => ({
      dispensers: DISPENSERS,
      staff: STAFF,
      terminals: TERMINALS,
      staffAssignments: [
        { duId: 'du-1', userId: 'u-1' },
        { duId: 'du-2', userId: '' },
      ],
      terminalAssignments: [
        { terminalId: 't-1', duId: 'du-1' },
        { terminalId: 't-2', duId: 'du-1' },
        { terminalId: 't-3', duId: '' },
      ],
      ...over,
    });

    const card = (name: RegExp) => within(screen.getByRole('group', { name }));
    const attendantValue = (name: RegExp) =>
      (card(name).getByLabelText(/Attendant/i) as HTMLSelectElement).value;
    const attachOptions = (name: RegExp) =>
      Array.from(
        card(name)
          .getByLabelText(/Attach POS/i)
          .querySelectorAll('option'),
      ).map((o) => o.textContent ?? '');

    it('does not draw a card inside a card', () => {
      // Each dispenser card is a Panel, so the section wrapping them must not
      // be one too — nesting puts a second bordered box inside the first,
      // against the compact/dense house style.
      renderForm(assignmentProps());
      const card = screen.getByRole('group', { name: /DU-1/ });
      expect(card.className).toMatch(/rounded-card/);
      expect(card.parentElement?.closest('.rounded-card')).toBeNull();
    });

    it('gives every dispenser its own card', () => {
      renderForm(assignmentProps());
      expect(screen.getByRole('group', { name: /DU-1/ })).toBeDefined();
      expect(screen.getByRole('group', { name: /DU-2/ })).toBeDefined();
    });

    it('shows the attendant that dispenser is assigned to', () => {
      renderForm(assignmentProps());
      expect(attendantValue(/DU-1/)).toBe('u-1');
    });

    it('reports a staff change against the dispenser whose card it came from', () => {
      const onStaffAssignmentChange = vi.fn();
      renderForm(assignmentProps({ onStaffAssignmentChange }));

      fireEvent.change(card(/DU-2/).getByLabelText(/Attendant/i), {
        target: { value: 'u-2' },
      });

      expect(onStaffAssignmentChange).toHaveBeenCalledWith('du-2', 'u-2');
    });

    /** Attached terminals are the ones with a detach control, not merely any
     *  text on the card — a POS the card can *offer* also appears, as an
     *  option in its attach select. */
    const attached = (name: RegExp) =>
      card(name)
        .queryAllByRole('button', { name: /Detach/i })
        .map((b) => b.getAttribute('aria-label') ?? '');

    it('lists a dispenser’s terminals on its own card, and only its own', () => {
      renderForm(assignmentProps());
      expect(attached(/DU-1/).some((l) => /POS A/.test(l))).toBe(true);
      expect(attached(/DU-1/).some((l) => /POS B/.test(l))).toBe(true);
      // Shift-wide, so DU-1 may attach it — but it is not attached.
      expect(attached(/DU-1/).some((l) => /POS C/.test(l))).toBe(false);
    });

    it('attaches more than one POS to one dispenser', () => {
      renderForm(assignmentProps());
      const removals = card(/DU-1/).getAllByRole('button', {
        name: /Detach POS/i,
      });
      expect(removals).toHaveLength(2);
    });

    it('attaches a terminal to the dispenser whose card it was added from', () => {
      const onTerminalAssignmentChange = vi.fn();
      renderForm(assignmentProps({ onTerminalAssignmentChange }));

      fireEvent.change(card(/DU-2/).getByLabelText(/Attach POS/i), {
        target: { value: 't-3' },
      });

      expect(onTerminalAssignmentChange).toHaveBeenCalledWith('t-3', 'du-2');
    });

    it('detaches a terminal by clearing its dispenser, which is how shift-wide is spelled', () => {
      const onTerminalAssignmentChange = vi.fn();
      renderForm(assignmentProps({ onTerminalAssignmentChange }));

      fireEvent.click(card(/DU-1/).getByRole('button', { name: /Detach POS A/i }));

      expect(onTerminalAssignmentChange).toHaveBeenCalledWith('t-1', '');
    });

    it('keeps an unassigned terminal visible as shift-wide', () => {
      // A POS shared across pumps is a real configuration, not an oversight —
      // it must have somewhere to live or it vanishes from the form.
      renderForm(assignmentProps());
      const shared = within(screen.getByRole('group', { name: /Shift-wide/i }));
      expect(shared.getByText(/POS C/)).toBeDefined();
      expect(shared.queryByText(/POS A/)).toBeNull();
    });

    it('offers a terminal held by another dispenser, and says where it is', () => {
      // One step to move a POS between pumps, but never a silent steal.
      renderForm(assignmentProps());
      expect(attachOptions(/DU-2/).some((t) => /POS A/.test(t) && /DU-1/.test(t))).toBe(true);
    });

    it('does not offer a dispenser the terminals it already holds', () => {
      renderForm(assignmentProps());
      expect(attachOptions(/DU-1/).some((t) => /POS A/.test(t))).toBe(false);
    });

    it('still shows terminals at a station that has no dispensers configured', () => {
      // No dispensers means nothing to attach to, so every POS is shift-wide —
      // which is exactly how the parent seeds them.
      renderForm(
        assignmentProps({
          dispensers: [],
          staffAssignments: [],
          terminalAssignments: TERMINALS.map((t) => ({ terminalId: t.id, duId: '' })),
        }),
      );
      const shared = within(screen.getByRole('group', { name: /Shift-wide/i }));
      expect(shared.getByText(/POS A/)).toBeDefined();
      expect(shared.getByText(/POS C/)).toBeDefined();
    });

    it('omits the shift-wide panel entirely when every POS is on a dispenser', () => {
      renderForm(
        assignmentProps({
          terminalAssignments: [
            { terminalId: 't-1', duId: 'du-1' },
            { terminalId: 't-2', duId: 'du-1' },
            { terminalId: 't-3', duId: 'du-2' },
          ],
        }),
      );
      expect(screen.queryByRole('group', { name: /Shift-wide/i })).toBeNull();
    });

    it('shows a dispenser card at a station with no terminals at all', () => {
      renderForm(assignmentProps({ terminals: [], terminalAssignments: [] }));
      expect(screen.getByRole('group', { name: /DU-1/ })).toBeDefined();
      expect(screen.queryByRole('group', { name: /Shift-wide/i })).toBeNull();
    });
  });

  /**
   * A dispenser can only be assigned an attendant at shift open — nothing
   * writes `shift_staff_assignments` afterwards. So a dispenser opened without
   * one cannot be handed over for the life of that shift, and the only way out
   * is to close and re-open, discarding the opening readings (#258).
   *
   * The escape hatch is not a per-shift toggle: a pump that nobody is working
   * is a pump that is not in use, which is what the dispenser's own
   * MAINTENANCE status already means — and such a dispenser is never offered
   * here. One attendant may cover several pumps, so a short-staffed shift
   * spreads rather than skips.
   */
  describe('requiring an attendant on every dispenser', () => {
    const DUS = [
      { id: 'du-1', code: 'DU-1', name: 'Pump One' },
      { id: 'du-2', code: 'DU-2', name: 'Pump Two' },
    ];
    const STAFF = [{ id: 'u-1', fullName: 'Ravi' }];

    const withAssignments = (assignments: { duId: string; userId: string }[]) =>
      renderForm({ dispensers: DUS, staff: STAFF, staffAssignments: assignments });

    /**
     * The blocking message specifically, not any text mentioning attendants —
     * the section description says "every pump in service needs an attendant"
     * on every render, and a looser matcher silently matched that instead.
     */
    const blockingMessage = () => screen.queryByRole('alert');

    it('takes an Opening Float per assigned Drawer and shows their sum (ADR 0005)', () => {
      const onOpeningFloatChange = vi.fn();
      renderForm({
        dispensers: DUS,
        staff: STAFF,
        onOpeningFloatChange,
        staffAssignments: [
          { duId: 'du-1', userId: 'u-1', openingFloat: 500 },
          { duId: 'du-2', userId: 'u-1', openingFloat: 250 },
        ],
      });
      expect(screen.getByText('₹750.00')).toBeTruthy();
      const float = document.getElementById('float-du-2') as HTMLInputElement;
      fireEvent.change(float, { target: { value: '300' } });
      expect(onOpeningFloatChange).toHaveBeenCalledWith('du-2', 300);
    });

    it('blocks the open while a dispenser has no attendant', () => {
      withAssignments([
        { duId: 'du-1', userId: 'u-1' },
        { duId: 'du-2', userId: '' },
      ]);
      expect(openButton().disabled).toBe(true);
      expect(blockingMessage()).not.toBeNull();
    });

    it('names the dispensers holding it up, so the operator knows which card', () => {
      withAssignments([
        { duId: 'du-1', userId: '' },
        { duId: 'du-2', userId: '' },
      ]);
      expect(blockingMessage()?.textContent).toMatch(/DU-1, DU-2 need an attendant/i);
    });

    it('names only the one holding it up when a single pump is short', () => {
      withAssignments([
        { duId: 'du-1', userId: 'u-1' },
        { duId: 'du-2', userId: '' },
      ]);
      const text = blockingMessage()?.textContent ?? '';
      expect(text).toMatch(/DU-2 needs an attendant/i);
      expect(text).not.toMatch(/DU-1/);
    });

    it('allows the open once every dispenser has one', () => {
      withAssignments([
        { duId: 'du-1', userId: 'u-1' },
        { duId: 'du-2', userId: 'u-1' },
      ]);
      expect(openButton().disabled).toBe(false);
      // One attendant covering both pumps is deliberately enough.
      expect(blockingMessage()).toBeNull();
    });

    it('does not block a station that runs no dispensers', () => {
      renderForm({ dispensers: [], staff: STAFF, staffAssignments: [] });
      expect(openButton().disabled).toBe(false);
    });

    it('blocks for the business-day reason independently of the attendant one', () => {
      // Both pumps are covered, so only the business-day clause can be
      // disabling this — otherwise the test passes for the wrong reason.
      renderForm(
        {
          dispensers: DUS,
          staff: STAFF,
          staffAssignments: [
            { duId: 'du-1', userId: 'u-1' },
            { duId: 'du-2', userId: 'u-1' },
          ],
        },
        { requestedState: 'CLOSED', openBusinessDays: [] },
      );
      expect(blockingMessage()).toBeNull();
      expect(openButton().disabled).toBe(true);
    });
  });
});
