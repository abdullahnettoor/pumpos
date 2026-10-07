import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(connectionString: string): DrizzleDb {
  const queryClient = postgres(connectionString, {
    // ONE connection per request-scoped client (#155): every additional
    // connection pays a full Postgres auth handshake — SCRAM-SHA-256 runs
    // PBKDF2 (4096 iterations) in Worker CPU per connection. With max > 1 a
    // Promise.all query batch could open several connections and burn the
    // whole 10 ms Workers CPU budget on handshakes alone (observed 17–50 ms →
    // exceededCpu). Hyperdrive holds the real server-side pool, so a single
    // client connection only serializes the Worker↔Hyperdrive hop; queries
    // still hit warm pooled connections behind it.
    max: 1,
    // No array types in the schema, so skip the pg_types startup query —
    // one fewer round-trip AND less result parsing on the request path.
    fetch_types: false,
    // Keep prepared statements enabled for Hyperdrive query caching.
    prepare: true,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(queryClient, { schema });
}

export function createDbWithOptions(
  connectionString: string,
  options?: { prepare?: boolean; max?: number },
): DrizzleDb {
  const queryClient = postgres(connectionString, {
    prepare: options?.prepare,
    max: options?.max ?? 1,
    fetch_types: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(queryClient, { schema });
}

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
export type DrizzleDb = PostgresJsDatabase<typeof schema>;
export type DbClient = DrizzleDb;
export type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];
export type DbExecutor = DbClient | DbTransaction;
export * as schema from './schema.js';
