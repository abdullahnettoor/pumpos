import type { Clock, IdGenerator } from './clock.js';

/**
 * Canonical business-event envelope (Handbook Vol. 4). Everything except
 * `payload` is standardized. Events are immutable facts: once created and
 * persisted they are never edited — corrections are new events.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  /** Unique id for this event instance (idempotency key for consumers). */
  eventId: string;
  eventType: TType;
  /** Tenant scope. */
  organizationId: string;
  /** Operational scope (null for org-level events). */
  stationId: string | null;
  /** Accounting/reporting anchor (null for non-financial events). */
  businessDayId: string | null;
  aggregateType: string;
  aggregateId: string;
  /** Payload schema version, so consumers can handle evolution. */
  version: number;
  /** When it happened in the real world (ISO 8601). */
  occurredAt: string;
  /** When it was persisted (ISO 8601). */
  recordedAt: string;
  /** Who caused it (null for system-generated events). */
  actorId: string | null;
  /** Groups all events produced by one workflow. */
  correlationId: string | null;
  /** The event that directly triggered this one, if any. */
  causationId: string | null;
  payload: TPayload;
  metadata: Record<string, unknown>;
}

export interface NewEventInput<TType extends string, TPayload> {
  eventType: TType;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  organizationId: string;
  stationId?: string | null;
  businessDayId?: string | null;
  actorId?: string | null;
  version?: number;
  occurredAt?: Date | string;
  correlationId?: string | null;
  causationId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EventFactoryDeps {
  ids: IdGenerator;
  clock: Clock;
}

/** Construct a fully-formed DomainEvent, filling id/timestamps/defaults. */
export function createEvent<TType extends string, TPayload>(
  input: NewEventInput<TType, TPayload>,
  deps: EventFactoryDeps,
): DomainEvent<TType, TPayload> {
  const recordedAt = deps.clock.now().toISOString();
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : (input.occurredAt ?? recordedAt);

  return {
    eventId: deps.ids.newId(),
    eventType: input.eventType,
    organizationId: input.organizationId,
    stationId: input.stationId ?? null,
    businessDayId: input.businessDayId ?? null,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    version: input.version ?? 1,
    occurredAt,
    recordedAt,
    actorId: input.actorId ?? null,
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    payload: input.payload,
    metadata: input.metadata ?? {},
  };
}
