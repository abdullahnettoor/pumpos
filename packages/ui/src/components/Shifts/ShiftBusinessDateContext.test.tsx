import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShiftBusinessDateContext } from './ShiftBusinessDateContext.js';
import { ShiftControlBar } from './ShiftControlBar.js';
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
          lastShiftSummary={null}
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
          timeZone="Asia/Kolkata"
          openingCash={0}
          staffAssignments={[]}
          onStaffAssignmentChange={() => {}}
          initialReadings={[]}
          onInitialReadingChange={() => {}}
          isOpening={false}
          onSubmit={() => {}}
          onViewLastShiftSummary={() => {}}
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

  it('shows the Station-local lifecycle time in the active state', () => {
    const html = renderToStaticMarkup(
      <ShiftControlBar
        activeShift={{
          ...historical,
          templateName: 'Morning',
          openedAt: '2026-09-12T01:30:00.000Z',
          openingCash: 1000,
        }}
        shiftTotals={{
          cashCollections: 0,
          cashExpenses: 0,
          cardCollections: 0,
          upiCollections: 0,
          creditSales: 0,
          expenseCount: 0,
          purchaseCount: 0,
          purchaseTotal: 0,
        }}
        handoversCompleted={0}
        handoversAssigned={0}
        quickActions={[]}
        onCloseShiftClick={() => {}}
        isPreparingClose={false}
        currentBusinessDate="2026-09-12"
        timeZone="Asia/Kolkata"
      />,
    );
    expect(html).toContain('Shift Opened At · 12 Sept 2026, 07:00 am');
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
    expect(html).toContain('Shift Closed At · 12 Sept 2026, 03:00 pm');
    expect(html).toContain('Working on 10 Sept 2026. Actions are being recorded on 12 Sept 2026.');
    expect(html).toContain('Open next Shift');
    expect(html).toContain('The Shift Summary is saved permanently.');
  });
});
