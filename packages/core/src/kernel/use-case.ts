import type { Result } from '@pump/shared';
import type { Clock, IdGenerator } from './clock.js';
import { createEvent } from './event.js';
import type { DomainEvent } from './event.js';

/**
 * Ambient context for a single use-case execution: who is acting and in which
 * tenant / operational scope, plus deterministic clock + id sources. Adapters
 * (e.g. the API auth middleware) build this from the authenticated request.
 */
export interface ExecutionContext {
  organizationId: string;
  stationId: string | null;
  businessDayId: string | null;
  actorId: string | null;
  correlationId: string | null;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * A use-case is a single business action (OpenShift, RecordExpense…). It
 * validates input, enforces invariants, persists via repository ports, emits
 * domain events, and returns a Result. Use-cases never touch HTTP or SQL.
 */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput, ctx: ExecutionContext): Promise<Result<TOutput>>;
}

/** Event input where tenant/scope/actor default from the execution context. */
export interface ContextEventInput<TType extends string, TPayload> {
  eventType: TType;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  version?: number;
  occurredAt?: Date | string;
  causationId?: string | null;
  metadata?: Record<string, unknown>;
  // Optional overrides (rarely needed):
  organizationId?: string;
  stationId?: string | null;
  businessDayId?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
}

/** Build a DomainEvent pre-filled from the execution context. */
export function eventFromContext<TType extends string, TPayload>(
  ctx: ExecutionContext,
  input: ContextEventInput<TType, TPayload>,
): DomainEvent<TType, TPayload> {
  return createEvent<TType, TPayload>(
    {
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
      organizationId: input.organizationId ?? ctx.organizationId,
      stationId: input.stationId ?? ctx.stationId,
      businessDayId: input.businessDayId ?? ctx.businessDayId,
      actorId: input.actorId ?? ctx.actorId,
      correlationId: input.correlationId ?? ctx.correlationId,
      version: input.version,
      occurredAt: input.occurredAt,
      causationId: input.causationId,
      metadata: input.metadata,
    },
    { ids: ctx.ids, clock: ctx.clock },
  );
}
