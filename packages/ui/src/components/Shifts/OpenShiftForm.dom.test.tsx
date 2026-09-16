// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
    openingCash: 5000,
    staffAssignments: [],
    onStaffAssignmentChange: vi.fn(),
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
      expect(values.openingCash).toBe(5000);
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
        <OpenShiftForm {...baseProps({ onSubmit, businessDate: TODAY, openingCash: 5000 })} />,
        { queryClient: client },
      );
      await waitFor(() => expect(openButton().disabled).toBe(false));

      const dateInput = document.querySelector('input[name="businessDate"]') as HTMLInputElement;
      if (dateInput) {
        fireEvent.change(dateInput, { target: { value: '2026-02-27' } });
        // An unrelated prop moves; the chosen date must survive it.
        rerender(
          <OpenShiftForm {...baseProps({ onSubmit, businessDate: TODAY, openingCash: 7250 })} />,
        );
        await waitFor(() => expect(dateInput.value).toBe('2026-02-27'));
      }
    });

    it('re-derives the submitted opening cash when the prop changes', async () => {
      const onSubmit = vi.fn();
      const client = createTestQueryClient();
      seedStatus(client, TODAY, {
        requestedState: 'OPEN',
        openBusinessDays: [{ businessDate: TODAY }],
      });

      const { rerender } = renderWithProviders(
        <OpenShiftForm {...baseProps({ onSubmit, openingCash: 5000 })} />,
        { queryClient: client },
      );
      await waitFor(() => expect(openButton().disabled).toBe(false));

      rerender(<OpenShiftForm {...baseProps({ onSubmit, openingCash: 7250 })} />);
      fireEvent.submit(openButton().closest('form')!);
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].openingCash).toBe(7250);
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
});
