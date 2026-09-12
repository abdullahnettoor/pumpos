import { describe, expect, it, vi } from 'vitest';
import type { RecordStockCountPayload } from '../services/cloud.js';
import { isAmbiguousMutationError, loadPendingStockCountRequest, loadPendingTankDipWorkflow, resolveStockCountRequestIdentity, savePendingStockCountRequest, savePendingTankDipWorkflow } from './stockCountMutation.js';

const payload: RecordStockCountPayload = {
  stationId: 'station-1',
  tankId: 'tank-1',
  actualQuantity: 4900,
};

describe('Stock Count mutation identity', () => {
  it('retains one idempotency key for an unchanged retry', () => {
    let created = 0;
    const createKey = () => `key-${++created}`;
    const first = resolveStockCountRequestIdentity(null, payload, createKey);
    const retry = resolveStockCountRequestIdentity(first, { ...payload }, createKey);

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe('key-1');
  });

  it('creates a new key when the measured quantity changes', () => {
    let created = 0;
    const createKey = () => `key-${++created}`;
    const first = resolveStockCountRequestIdentity(null, payload, createKey);
    const edited = resolveStockCountRequestIdentity(first, { ...payload, actualQuantity: 4890 }, createKey);

    expect(edited.idempotencyKey).toBe('key-2');
  });

  it('persists retryable Tank Dip identities across reloads', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const workflow = {
      expectedCash: 100,
      closingCash: 100,
      variance: 0,
      lastClosedShiftId: 'shift-1',
      nextTemplateId: 'template-2',
      businessDate: '2026-09-12',
      currentBusinessDate: '2026-09-12',
      openedAt: '2026-09-12T06:00:00.000Z',
      closedAt: '2026-09-12T14:00:00.000Z',
      tankDips: [{ tankId: 'tank-1', tankName: 'MS Tank', actualQuantity: 4900, status: 'saving' as const, idempotencyKey: 'key-1' }],
    };

    savePendingTankDipWorkflow('station-1', workflow);

    expect(loadPendingTankDipWorkflow('station-1')?.tankDips[0]).toMatchObject({ status: 'pending', idempotencyKey: 'key-1' });
    vi.unstubAllGlobals();
  });

  it('persists a standalone Stock Count identity across reloads', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const identity = resolveStockCountRequestIdentity(null, payload, () => 'key-1');

    savePendingStockCountRequest({ ...identity, payload });

    expect(loadPendingStockCountRequest()).toEqual({ ...identity, payload });
    vi.unstubAllGlobals();
  });

  it('distinguishes ambiguous transport outcomes from definitive rejections', () => {
    expect(isAmbiguousMutationError({ code: 'NETWORK' })).toBe(true);
    expect(isAmbiguousMutationError({ code: 'CONFLICT' })).toBe(true);
    expect(isAmbiguousMutationError({ code: 'BAD_RESPONSE' })).toBe(true);
    expect(isAmbiguousMutationError({ code: 'VALIDATION_ERROR' })).toBe(false);
  });
});
