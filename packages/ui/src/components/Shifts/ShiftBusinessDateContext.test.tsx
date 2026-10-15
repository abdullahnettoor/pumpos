import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShiftBusinessDateContext } from './ShiftBusinessDateContext.js';
import { LiveShiftBar } from './LiveShiftBar.js';
import { ShiftCloseSuccess } from './ShiftCloseSuccess.js';
import { OpenShiftForm } from './OpenShiftForm.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '../../query/hooks.js';

const historical = {
  businessDate: '2026-09-10',
  currentBusinessDate: '2026-09-12',
  scheduledStartTime: '06:00',
  scheduledEndTime: '14:00',
  timeZone: 'Asia/Kolkata',
};

describe('ShiftBusinessDateContext', () => {
  it('keeps historical context visible on the open form with eligible date choices', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.businessDayStatus('station-1', '2026-09-10'), {
      requestedState: 'OPEN',
      openBusinessDays: [
        {
          id: 'past',
          businessDate: '2026-09-10',
          status: 'OPEN',
          openedAt: '',
          closedAt: null,
          openShiftCount: 0,
          closedShiftCount: 1,
          lastActivityAt: '',
        },
        {
          id: 'future',
          businessDate: '2026-09-13',
          status: 'OPEN',
          openedAt: '',
          closedAt: null,
          openShiftCount: 0,
          closedShiftCount: 0,
          lastActivityAt: '',
        },
      ],
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <OpenShiftForm
          lastShift={{ id: 'previous' }}
          stationId="station-1"
          templates={[{ id: 'template-1', name: 'Morning', startTime: '06:00', endTime: '14:00' }]}
          dispensers={[]}
          staff={[]}
          nozzles={[]}
          terminals={[]}
          terminalAssignments={[]}
          onTerminalAssignmentChange={() => {}}
          selectedTemplateId="template-1"
          businessDate="2026-09-10"
          currentBusinessDate="2026-09-12"
          onOpeningFloatChange={() => undefined}
          staffAssignments={[]}
          onStaffAssignmentChange={() => {}}
          initialReadings={[]}
          onInitialReadingChange={() => {}}
          isOpening={false}
          onSubmit={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('Shift Business Date · 10 Sept 2026');
    expect(html).toContain('Scheduled Shift Window · 06:00–14:00');
    expect(html).toContain('Working on 10 Sept 2026. Actions are being recorded on 12 Sept 2026.');
    expect(html).toContain('2026-09-10 · Open');
    expect(html).toContain('2026-09-13 · Open · Unavailable (future)');
    expect(html).toContain('Custom Business Date');
  });

  it('shows the Station-local opened time and the historical context on the live shift', () => {
    const html = renderToStaticMarkup(
      <LiveShiftBar
        templateName="Morning"
        state="shift-live"
        openedAt="2026-09-12T01:30:00.000Z"
        scheduledEndTime="14:00"
        businessDate={historical.businessDate}
        currentBusinessDate={historical.currentBusinessDate}
        timeZone="Asia/Kolkata"
        handoversRecorded={0}
        handoversExpected={2}
        closing={false}
      />,
    );
    expect(html).toContain('7:00\u00a0am');
    expect(html).toContain('Working on 10 Sept 2026. Actions are being recorded on 12 Sept 2026.');
  });

  it('keeps both lifecycle timestamps and historical context after close', () => {
    const html = renderToStaticMarkup(
      <ShiftCloseSuccess
        result={{
          expectedCash: 1000,
          closingCash: 1000,
          variance: 0,
          lastClosedShiftId: 'shift-1',
          nextTemplateId: 'template-2',
          ...historical,
          openedAt: '2026-09-12T01:30:00.000Z',
          closedAt: '2026-09-12T09:30:00.000Z',
        }}
        onStartNext={() => {}}
        onViewSummary={() => {}}
        onBack={() => {}}
      />,
    );
    expect(html).toContain('closed 12 Sept 2026, 03:00 pm');
    expect(html).toContain('Working on 10 Sept 2026. Actions are being recorded on 12 Sept 2026.');
    expect(html).toContain('Open next shift');
    expect(html).toContain('Its Shift Summary is saved and locked.');
  });
});
