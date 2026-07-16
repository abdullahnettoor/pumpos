import { type DbClient } from '@pump/db';
import type { EventPublisher, Result, CoreError } from '@pump/core';
import { createDispatcher } from './events.js';

/** Internal signal used to roll back a transaction when a use-case returns err. */
class RollbackSignal extends Error {
  constructor(public readonly error: CoreError) {
    super('rollback');
  }
}

/**
 * Run a transactional use-case with the transactional-outbox pattern:
 * state changes AND the event-store append happen in one DB transaction, so a
 * failure anywhere rolls back both. If the use-case returns a failed Result,
 * the transaction is rolled back and the same Result is returned.
 *
 * The `tx` passed to `fn` is the transaction-scoped DB handle; build repositories
 * with it so their writes participate in the transaction. The `events` publisher
 * appends to the `events` table within the same transaction.
 */
export async function runInTransaction<T>(
  db: DbClient,
  fn: (tx: DbClient, events: EventPublisher) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DbClient;
      const events = createDispatcher(tx);
      const result = await fn(tx, events);
      if (!result.success) {
        throw new RollbackSignal(result.error);
      }
      return result;
    });
  } catch (e) {
    if (e instanceof RollbackSignal) {
      return { success: false, error: e.error };
    }
    throw e;
  }
}
