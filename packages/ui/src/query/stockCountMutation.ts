import type { RecordStockCountPayload } from '../services/cloud.js';

export interface StockCountRequestIdentity {
  fingerprint: string;
  idempotencyKey: string;
}

export interface PendingTankDip {
  tankId: string;
  tankName: string;
  actualQuantity: number;
  reason?: string;
  status: 'pending' | 'saving' | 'saved' | 'failed';
  error?: string;
  idempotencyKey: string;
  expectedQuantity?: number;
  varianceQuantity?: number;
}

export interface PendingTankDipWorkflow {
  expectedCash: number;
  closingCash: number;
  variance: number;
  lastClosedShiftId: string;
  nextTemplateId: string;
  businessDate: string;
  currentBusinessDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  openedAt: string;
  closedAt: string;
  timeZone?: string;
  tankDips: PendingTankDip[];
  closeStatus?: 'submitting' | 'closed';
}

export function shouldResetTankDipDraft(previousShiftId: string | null, activeShiftId: string | null): boolean {
  return activeShiftId !== null && activeShiftId !== previousShiftId;
}

export function discardUnrecordedTankDips(workflow: PendingTankDipWorkflow): PendingTankDipWorkflow {
  return { ...workflow, tankDips: workflow.tankDips.filter((dip) => dip.status === 'saved') };
}

const pendingTankDipKey = (stationId: string) => `pumpos:pending-tank-dips:${stationId}`;
const pendingStockCountKey = 'pumpos:pending-stock-count';

export interface PendingStockCountRequest extends StockCountRequestIdentity {
  payload: RecordStockCountPayload;
}

export function loadPendingStockCountRequest(): PendingStockCountRequest | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(pendingStockCountKey) ?? 'null') as PendingStockCountRequest | null;
  } catch {
    return null;
  }
}

export function savePendingStockCountRequest(request: PendingStockCountRequest | null): void {
  if (typeof localStorage === 'undefined') return;
  if (request) localStorage.setItem(pendingStockCountKey, JSON.stringify(request));
  else localStorage.removeItem(pendingStockCountKey);
}

export function loadPendingTankDipWorkflow(stationId: string): PendingTankDipWorkflow | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(pendingTankDipKey(stationId)) ?? 'null') as PendingTankDipWorkflow | null;
  } catch {
    return null;
  }
}

export function savePendingTankDipWorkflow(stationId: string, workflow: PendingTankDipWorkflow | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!workflow || workflow.tankDips.every((dip) => dip.status === 'saved')) {
    localStorage.removeItem(pendingTankDipKey(stationId));
    return;
  }
  localStorage.setItem(pendingTankDipKey(stationId), JSON.stringify({
    ...workflow,
    tankDips: workflow.tankDips.map((dip) => dip.status === 'saving' ? { ...dip, status: 'pending' } : dip),
  }));
}

export function isAmbiguousMutationError(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'NETWORK' || error?.code === 'CONFLICT' || error?.code === 'BAD_RESPONSE';
}

export function createStockCountIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `stock-count-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function resolveStockCountRequestIdentity(
  current: StockCountRequestIdentity | null | undefined,
  payload: RecordStockCountPayload,
  createKey = createStockCountIdempotencyKey,
): StockCountRequestIdentity {
  const fingerprint = JSON.stringify(payload);
  return current?.fingerprint === fingerprint ? current : { fingerprint, idempotencyKey: createKey() };
}
