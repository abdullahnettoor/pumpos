import { InProcessEventDispatcher, consoleLogger } from '@pump/core';
import type { DomainEvent, EventStore } from '@pump/core';
import { schema, type DbClient } from '@pump/db';

/**
 * Persists domain events to the canonical append-only `events` table. In a
 * later phase this append will participate in the same transaction as the state
 * change (transactional outbox); for now it is a direct insert after commit.
 */
export class DrizzleEventStore implements EventStore {
  constructor(private readonly db: DbClient) {}

  async append(events: ReadonlyArray<DomainEvent>): Promise<void> {
    if (events.length === 0) return;
    await this.db.insert(schema.events).values(
      events.map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        organizationId: e.organizationId,
        stationId: e.stationId,
        businessDayId: e.businessDayId,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        version: e.version,
        occurredAt: new Date(e.occurredAt),
        recordedAt: new Date(e.recordedAt),
        actorId: e.actorId,
        correlationId: e.correlationId,
        causationId: e.causationId,
        payload: e.payload as Record<string, unknown>,
        metadata: e.metadata,
      })),
    );
  }
}

/** Build an in-process dispatcher backed by the events table for this request. */
export function createDispatcher(db: DbClient): InProcessEventDispatcher {
  return new InProcessEventDispatcher({
    store: new DrizzleEventStore(db),
    logger: consoleLogger,
  });
}
