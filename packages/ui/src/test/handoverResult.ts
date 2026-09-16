import type { RecordHandoverPayload, RecordHandoverResult } from '../services/cloud.js';

/**
 * A faithful `RecordHandoverResult` double.
 *
 * Both handover screens consume the server's echo after a successful save —
 * the desktop drawer iterates `result.nozzleReadings` to reseed its form, and
 * mobile reads `result.handover.cashHandedOver`. A partial stub makes the save
 * throw *after* the payload has been built, so a payload assertion still passes
 * while the operator would have seen an error banner. Tests must use this.
 */
export function handoverResultFor(
  payload: RecordHandoverPayload,
  over: Partial<RecordHandoverResult> = {},
): RecordHandoverResult {
  const readings = (payload.nozzleReadings ?? []).map((r, i) => ({
    id: `hr-${i}`,
    nozzleId: r.nozzleId,
    openingReading: 0,
    closingReading: Number(r.closingReading ?? 0),
    grossVolume: Number(r.closingReading ?? 0),
    testingVolume: Number(r.testingVolume ?? 0),
    netVolume: Number(r.closingReading ?? 0) - Number(r.testingVolume ?? 0),
    unitPrice: 0,
    expectedSales: 0,
  }));
  const cash = Number(payload.cashHandedOver ?? 0);
  return {
    handover: {
      id: 'handover-1',
      shiftId: payload.shiftId,
      attendantId: payload.userId ?? 'user-1',
      duId: payload.duId,
      cashHandedOver: String(cash),
      cardHandedOver: String((payload as { cardHandedOver?: number }).cardHandedOver ?? 0),
      upiHandedOver: String((payload as { upiHandedOver?: number }).upiHandedOver ?? 0),
      creditHandedOver: '0',
      testingVolume: '0',
      expectedSales: '0',
      varianceAmount: '0',
      createdAt: '2026-03-01T12:00:00.000Z',
    },
    terminalEntries: (payload.terminalEntries ?? []).map((t, i) => ({
      id: `te-${i}`,
      handoverId: 'handover-1',
      terminalId: t.terminalId,
      duId: (t as { duId?: string | null }).duId ?? 'du-1',
      cardAmount: String(t.cardAmount ?? 0),
      upiAmount: String(t.upiAmount ?? 0),
      batchRef: (t as { batchRef?: string | null }).batchRef ?? null,
      createdAt: '2026-03-01T12:00:00.000Z',
    })),
    nozzleReadings: readings,
    expectedFuelSales: 0,
    merchandiseCash: 0,
    expectedSales: 0,
    expectedTotal: 0,
    creditSales: 0,
    omcCardSales: 0,
    declaredTotal: cash,
    varianceAmount: 0,
    replaced: false,
    ...over,
  };
}
