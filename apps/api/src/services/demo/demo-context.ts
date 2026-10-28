import type { DbClient } from '@pump/db';
import type {
  DocumentNumberGenerator,
  EventPublisher,
  ExecutionContext,
  Result,
  UuidGenerator,
} from '@pump/core';
import type {
  DrizzleBusinessDayRepository,
  DrizzleShiftRepository,
  DrizzleShiftWriteGateReader,
} from '../../infra/repositories/station-ops-repositories.js';
import type { DrizzleStockMovementRepository } from '../../infra/repositories/inventory-repositories.js';

/** An `ExecutionContext` for the demo actor at a fixed instant. */
export type DemoContextFactory = (
  at: Date,
  actorId: string,
  businessDayId?: string | null,
) => ExecutionContext;

/** Station master data the demo seed modules share (rows are read once). */
export interface DemoContext {
  tx: DbClient;
  events: EventPublisher;
  ids: UuidGenerator;
  docNumbers: DocumentNumberGenerator;
  stationId: string;
  stationSettings: unknown;
  context: DemoContextFactory;
  shifts: DrizzleShiftRepository;
  businessDays: DrizzleBusinessDayRepository;
  shiftWriteGate: DrizzleShiftWriteGateReader;
  stockMovements: DrizzleStockMovementRepository;
  managerId: string;
  accountantId: string;
  supplierId: string;
  tanksOf: (productId: string) => Array<{ id: string }>;
  bookOf: (tankId: string) => Promise<number>;
  priceOf: (productId: string) => number;
}

export class DemoSeedError extends Error {}

export function must<T>(result: Result<T>, step: string): T {
  if (!result.success) {
    throw new DemoSeedError(
      `Demo history step "${step}" failed: ${result.error.code} ${result.error.message}`,
    );
  }
  return result.data;
}
