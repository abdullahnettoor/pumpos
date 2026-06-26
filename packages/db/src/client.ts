import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(connectionString: string) {
  const queryClient = postgres(connectionString, {
    // Disable prepared statements: the API connects through Hyperdrive in front
    // of Supabase's transaction-mode pooler (supavisor :6543). In transaction
    // mode each transaction may land on a different backend, so reused prepared
    // statement names fail ("internal error; reference=..."). Disabling them
    // makes queries safe across pooled/multiplexed connections.
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(queryClient, { schema });
}

export function createDbWithOptions(
  connectionString: string,
  options?: { prepare?: boolean; max?: number }
) {
  const queryClient = postgres(connectionString, {
    prepare: options?.prepare,
    max: options?.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(queryClient, { schema });
}

export type DbClient = ReturnType<typeof createDb>;
export * as schema from './schema.js';
