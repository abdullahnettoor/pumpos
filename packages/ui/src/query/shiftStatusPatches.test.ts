import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { BusinessDayStatusResponse } from '../services/cloud.js';
import { queryKeys } from './hooks.js';
import { isAwaitingConfirmation } from './patches/applyPatch.js';
import { withClosedBusinessDay } from './patches/businessDay.js';
import { inRangeKey, insertRecord, withVoidedRecord } from './patches/officeRecords.js';
import { cachedStatus } from './patches/shiftStatus.fixtures.js';
import {
  patchBusinessDayClosed,
  patchShiftStatusWithCustomerSale,
  patchShiftStatusWithoutCustomerSale,
} from './shiftStatusPatches.js';

const day = (id: string, businessDate: string, status: 'OPEN' | 'CLOSED' = 'OPEN') => ({
  id,
  businessDate,
  status,
  openedAt: `${businessDate}T00:30:00.000Z`,
  closedAt: null,
  openShiftCount: 0,
  closedShiftCount: 2,
  lastActivityAt: `${businessDate}T18:00:00.000Z`,
});

function dayStatus(): BusinessDayStatusResponse {
  return {
    currentBusinessDate: '2026-10-15',
    requestedBusinessDate: '2026-10-13',
    requestedState: 'OPEN',
    requestedBusinessDay: day('d-13', '2026-10-13'),
    openBusinessDays: [day('d-15', '2026-10-15'), day('d-13', '2026-10-13')],
    pastOpenBusinessDays: [day('d-13', '2026-10-13')],
    recentBusinessDays: [
      day('d-15', '2026-10-15'),
      day('d-14', '2026-10-14', 'CLOSED'),
      day('d-13', '2026-10-13'),
    ],
    recentFromBusinessDate: '2026-10-02',
  };
}

const closedAnswer = {
  id: 'd-13',
  businessDate: '2026-10-13',
  status: 'CLOSED',
  closedAt: '2026-10-15T09:30:00.000Z',
};

describe('withClosedBusinessDay', () => {
  it('reads the day Closed and out of the open lists, from the answer', () => {
    const after = withClosedBusinessDay(dayStatus(), closedAnswer);
    expect(after.requestedState).toBe('CLOSED');
    expect(after.requestedBusinessDay).toMatchObject({
      status: 'CLOSED',
      closedAt: closedAnswer.closedAt,
    });
    expect(after.openBusinessDays.map((d) => d.id)).toEqual(['d-15']);
    expect(after.pastOpenBusinessDays).toEqual([]);
    expect(after.recentBusinessDays[2]).toMatchObject({ status: 'CLOSED', closedShiftCount: 2 });
    expect(after.recentBusinessDays[0].status).toBe('OPEN');
  });

  it('is a no-op for a day it does not list or an answer that is not closed', () => {
    const before = dayStatus();
    expect(withClosedBusinessDay(before, { ...closedAnswer, id: 'd-01' })).toBe(before);
    expect(withClosedBusinessDay(before, { ...closedAnswer, status: 'OPEN' })).toBe(before);
  });
});

describe('office record list helpers', () => {
  it('a replayed answer is listed once; a void that changes nothing is a no-op', () => {
    const list = [{ id: 'a', entryDate: '2026-10-14', createdAt: 'x', status: 'ACTIVE' }];
    expect(insertRecord(list, list[0])).toBe(list);
    expect(
      withVoidedRecord(list, { ...list[0], stationId: 's', amount: '1', status: 'ACTIVE' }),
    ).toBe(list);
  });

  it('a range key holds a record of its station and dates only', () => {
    const rec = { id: 'r', stationId: 's-1', entryDate: '2026-10-14', amount: '1', createdAt: '' };
    expect(inRangeKey(['income', 's-1', '2026-10-01', '2026-10-31'], rec)).toBe(true);
    expect(inRangeKey(['income', 's-1', '', ''], rec)).toBe(true);
    expect(inRangeKey(['income', 's-2', '', ''], rec)).toBe(false);
    expect(inRangeKey(['income', 's-1', '2026-10-15', ''], rec)).toBe(false);
  });
});

describe('applying shift-board patches through the client', () => {
  it('a closed day patches every cached status of the station and awaits confirmation', () => {
    const qc = new QueryClient();
    const keyA = queryKeys.businessDayStatus('station-1', '2026-10-13');
    const keyB = queryKeys.businessDayStatus('station-1', '');
    qc.setQueryData(keyA, dayStatus());
    qc.setQueryData(keyB, dayStatus());

    patchBusinessDayClosed(qc, 'station-1', closedAnswer);

    for (const key of [keyA, keyB]) {
      const data = qc.getQueryData<BusinessDayStatusResponse>(key)!;
      expect(data.pastOpenBusinessDays).toEqual([]);
      expect(isAwaitingConfirmation(key, qc.getQueryState(key)?.dataUpdatedAt)).toBe(true);
    }
  });

  it('a refetch confirms a patch even when its answer equals it', () => {
    const qc = new QueryClient();
    const key = queryKeys.businessDayStatus('station-1', '');
    qc.setQueryData(key, dayStatus());
    patchBusinessDayClosed(qc, 'station-1', closedAnswer);
    const patched = qc.getQueryData(key);

    // What a refetch does on success: new data, a later dataUpdatedAt.
    qc.setQueryData(key, patched, { updatedAt: Date.now() + 1000 });

    expect(isAwaitingConfirmation(key, qc.getQueryState(key)?.dataUpdatedAt)).toBe(false);
  });

  it('a customer sale and its void reach the cached board', () => {
    const qc = new QueryClient();
    const key = queryKeys.shiftStatus('station-1', false);
    qc.setQueryData(key, cachedStatus());
    const entry = {
      id: 'ct-9',
      shiftId: 'shift-1',
      attendantId: 'u-ravi',
      duId: 'du-1',
      customerId: 'c-1',
      vehicleId: null,
      productId: null,
      transactionType: 'Credit Sale' as const,
      amount: '1000.00',
      quantity: null,
      unitPrice: null,
      notes: null,
    };
    const labels = {
      customerName: 'KSRTC',
      customerType: 'Fleet',
      productName: null,
      productCode: null,
    };

    patchShiftStatusWithCustomerSale(qc, 'station-1', entry, labels);
    const ravi = () =>
      qc.getQueryData<ReturnType<typeof cachedStatus>>(key)!.activeShift.staffAssignments[0];
    expect(ravi().creditSales).toEqual([expect.objectContaining({ id: 'ct-9', amount: 1000 })]);

    patchShiftStatusWithoutCustomerSale(qc, 'station-1', 'shift-1', 'ct-9');
    expect(ravi().creditSales).toEqual([]);
  });
});
