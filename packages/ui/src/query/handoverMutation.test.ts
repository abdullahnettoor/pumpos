import { describe, expect, it, vi } from 'vitest';
import type { RecordHandoverPayload, RecordHandoverResult } from '../services/cloud.js';
import { handoverInvalidationKeys, handoverPayloadFingerprint, loadHandoverRequestIdentity, resolveHandoverRequestIdentity, saveHandoverRequestIdentity, selectHandoverSummary } from './handoverMutation.js';

const payload: RecordHandoverPayload = {
  shiftId: 'shift-1',
  userId: 'user-1',
  duId: 'du-1',
  cashHandedOver: 100,
  nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 110, testingVolume: 0 }],
};

const accepted = {
  expectedTotal: 900,
  declaredTotal: 910,
  varianceAmount: 10,
} as RecordHandoverResult;

describe('Handover mutation state', () => {
  it('retains one idempotency key for an unchanged retry', () => {
    let created = 0;
    const createKey = () => `key-${++created}`;
    const first = resolveHandoverRequestIdentity(null, payload, createKey);
    const retry = resolveHandoverRequestIdentity(first, { ...payload }, createKey);

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe('key-1');
  });

  it('creates a new identity after the operator edits the command', () => {
    let created = 0;
    const createKey = () => `key-${++created}`;
    const first = resolveHandoverRequestIdentity(null, payload, createKey);
    const edited = resolveHandoverRequestIdentity(first, { ...payload, cashHandedOver: 101 }, createKey);

    expect(edited.idempotencyKey).toBe('key-2');
    expect(edited.fingerprint).not.toBe(handoverPayloadFingerprint(payload));
  });

  it('retains a queued Handover identity across reloads', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const identity = resolveHandoverRequestIdentity(null, payload, () => 'key-1');

    saveHandoverRequestIdentity('station-1', 'shift-1', 'user-1', 'du-1', identity);

    expect(loadHandoverRequestIdentity('station-1', 'shift-1', 'user-1', 'du-1')).toEqual(identity);
    expect(loadHandoverRequestIdentity('station-2', 'shift-1', 'user-1', 'du-1')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows the live preview until an accepted server result replaces it', () => {
    expect(selectHandoverSummary({ expectedTotal: 800, declaredTotal: 810, varianceAmount: 10 })).toEqual({
      source: 'preview', expectedTotal: 800, declaredTotal: 810, varianceAmount: 10,
    });
    expect(selectHandoverSummary({ expectedTotal: 800, declaredTotal: 810, varianceAmount: 10 }, accepted)).toEqual({
      source: 'accepted', expectedTotal: 900, declaredTotal: 910, varianceAmount: 10,
    });
  });

  it('invalidates only Handover-owned operational projections', () => {
    expect(handoverInvalidationKeys('station-1')).toEqual([
      ['shift-status', 'station-1'],
      ['my-assignment'],
      ['dssr-preview', 'station-1'],
      ['activity-groups', 'station-1'],
    ]);
  });
});
