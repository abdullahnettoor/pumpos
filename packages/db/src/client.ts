import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const dbCache = new Map<string, ReturnType<typeof drizzle<typeof schema>>>();

export function createDb(connectionString: string) {
  const cached = dbCache.get(connectionString);
  if (cached) return cached;
  const queryClient = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(queryClient, { schema });
  dbCache.set(connectionString, db);
  return db;
}

export type DbClient = ReturnType<typeof createDb>;
export * as schema from './schema.js';
