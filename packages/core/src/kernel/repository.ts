/**
 * Repository ports. Interfaces live in core; Drizzle implementations live in
 * the API adapter and are injected. Repositories only read and persist — they
 * contain no business rules (Handbook Vol. 2, Principle 15).
 */
export interface Repository<TAggregate, TId = string> {
  findById(id: TId): Promise<TAggregate | null>;
  save(aggregate: TAggregate): Promise<void>;
}

/** Tenant-owned setup aggregates must be scoped at the persistence boundary. */
export interface TenantRepository<TAggregate> {
  findById(id: string, organizationId: string): Promise<TAggregate | null>;
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

/**
 * Generates human-readable document numbers (e.g. COLL-000123, PURCH-000045).
 * Implemented by an adapter (e.g. backed by the document_sequences table).
 */
export interface DocumentNumberGenerator {
  next(documentType: string): Promise<string>;
}
