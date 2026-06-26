/**
 * Repository ports. Interfaces live in core; Drizzle implementations live in
 * the API adapter and are injected. Repositories only read and persist — they
 * contain no business rules (Handbook Vol. 2, Principle 15).
 */
export interface Repository<TAggregate, TId = string> {
  findById(id: TId): Promise<TAggregate | null>;
  save(aggregate: TAggregate): Promise<void>;
}

/**
 * Transactional boundary. Adapters implement `run` so a use-case can persist
 * state and append events atomically (transactional outbox). The callback
 * resolves when all work has been staged; the adapter commits on success and
 * rolls back on throw.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
