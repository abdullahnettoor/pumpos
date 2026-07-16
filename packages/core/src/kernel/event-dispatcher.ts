import type { DomainEvent } from './event.js';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  debug: (m, meta) => console.debug(m, meta ?? ''),
  info: (m, meta) => console.info(m, meta ?? ''),
  warn: (m, meta) => console.warn(m, meta ?? ''),
  error: (m, meta) => console.error(m, meta ?? ''),
};

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Append-only audit log for the canonical `events` table. Adapters implement
 * this against the database; in the API the append should participate in the
 * same transaction as the state change (transactional outbox).
 */
export interface EventStore {
  append(events: ReadonlyArray<DomainEvent>): Promise<void>;
}

/** A projection / reaction to domain events (inventory, ledgers, analytics…). */
export interface EventHandler {
  readonly name: string;
  /** Event types this handler reacts to, or '*' for all. */
  readonly subscribesTo: readonly string[] | '*';
  handle(event: DomainEvent): Promise<void>;
}

export interface EventPublisher {
  publish(events: ReadonlyArray<DomainEvent>): Promise<void>;
}

function subscribes(handler: EventHandler, eventType: string): boolean {
  return handler.subscribesTo === '*' || handler.subscribesTo.includes(eventType);
}

export interface DispatcherOptions {
  store: EventStore;
  handlers?: EventHandler[];
  logger?: Logger;
}

/**
 * In-process dispatcher: persists events to the audit store, then invokes
 * matching handlers synchronously.
 *
 * Handler failures are isolated and logged rather than thrown: projections are
 * derived and replayable, so one failing projection must not corrupt the others
 * or the already-committed source-of-truth row. This keeps ~90% of the benefits
 * of an event bus without the infrastructure (Handbook Vol. 4).
 */
export class InProcessEventDispatcher implements EventPublisher {
  private readonly store: EventStore;
  private readonly handlers: EventHandler[];
  private readonly logger: Logger;

  constructor(options: DispatcherOptions) {
    this.store = options.store;
    this.handlers = options.handlers ? [...options.handlers] : [];
    this.logger = options.logger ?? noopLogger;
  }

  register(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    if (events.length === 0) return;

    await this.store.append(events);

    for (const event of events) {
      for (const handler of this.handlers) {
        if (!subscribes(handler, event.eventType)) continue;
        try {
          await handler.handle(event);
        } catch (error) {
          this.logger.error('Event handler failed', {
            handler: handler.name,
            eventType: event.eventType,
            eventId: event.eventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
}

/** In-memory event store for tests and local development. */
export class InMemoryEventStore implements EventStore {
  readonly events: DomainEvent[] = [];

  async append(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.events.push(...events);
  }
}
