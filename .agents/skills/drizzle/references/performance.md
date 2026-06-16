# Performance Optimization

Comprehensive guide to optimizing query performance, connection pooling, and database scaling with Drizzle ORM.

## Query Profiling

### Using EXPLAIN

```typescript
import { sql } from 'drizzle-orm';

// Analyze query plan
const query = db.select().from(users).where(eq(users.id, 1));
const explanation = await db.execute(sql`EXPLAIN ANALYZE ${query}`);
console.log(explanation);
```

## Select Only Needed Columns

```typescript
// ❌ Bad: Selects all columns
const allData = await db.select().from(users);

// ✅ Good: Selects only required columns
const partialData = await db.select({
  id: users.id,
  email: users.email,
}).from(users);
```

## Prepared Queries

```typescript
// Prepare query for performance
const prepared = db.select({
  id: users.id,
  email: users.email,
}).from(users).where(eq(users.id, sql.placeholder('id'))).prepare('user_by_id');

// Execute prepared query
const result = await prepared.execute({ id: 1 });
```

## Cursor-Based Pagination

```typescript
import { and, gt, desc } from 'drizzle-orm';

// Fast pagination for large datasets
async function getPaginatedUsers(cursor?: string, limit: number = 10) {
  const query = db.select().from(users).orderBy(desc(users.id)).limit(limit);

  if (cursor) {
    return await query.where(lt(users.id, cursor));
  }

  return await query;
}
```

## Materialized Views (PostgreSQL)

```typescript
// Define schema
export const userStats = pgMaterializedView('user_stats').as((qb) =>
  qb.select({
    id: users.id,
    name: users.name,
    postCount: sql<number>`COUNT(${posts.id})`,
    commentCount: sql<number>`COUNT(${comments.id})`,
  })
  .from(users)
  .leftJoin(posts, eq(posts.authorId, users.id))
  .leftJoin(comments, eq(comments.userId, users.id))
  .groupBy(users.id)
);

// Refresh materialized view
await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats`);

// Query materialized view (fast!)
const stats = await db.select().from(userStats);
```

## Batch Operations Optimization

### Batch Insert with COPY (PostgreSQL)

```typescript
import { copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

async function bulkInsert(data: any[]) {
  const client = await pool.connect();

  try {
    const stream = client.query(
      copyFrom(`COPY users (email, name) FROM STDIN WITH (FORMAT csv)`)
    );

    const input = Readable.from(
      data.map(row => `${row.email},${row.name}\n`)
    );

    await pipeline(input, stream);
  } finally {
    client.release();
  }
}
```

### Chunk Processing

```typescript
async function* chunked<T>(array: T[], size: number) {
  for (let i = 0; i < array.length; i += size) {
    yield array.slice(i, i + size);
  }
}

async function bulkUpdate(updates: { id: number; name: string }[]) {
  for await (const chunk of chunked(updates, 100)) {
    await db.transaction(async (tx) => {
      for (const update of chunk) {
        await tx.update(users)
          .set({ name: update.name })
          .where(eq(users.id, update.id));
      }
    });
  }
}
```

## Connection Management

### Serverless Optimization

```typescript
// Reuse connection across warm starts
let cachedDb: ReturnType<typeof drizzle> | null = null;

export async function handler() {
  if (!cachedDb) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1, // Serverless: single connection per instance
    });
    cachedDb = drizzle(pool);
  }

  const users = await cachedDb.select().from(users);
  return users;
}
```

### HTTP-based Databases (Neon, Turso)

```typescript
// No connection pooling needed - uses HTTP
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Each query is a single HTTP request
const users = await db.select().from(users);
```

## Read Replicas

```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// Primary (writes)
const primaryPool = new Pool({ connectionString: process.env.PRIMARY_DB_URL });
const primaryDb = drizzle(primaryPool);

// Replica (reads)
const replicaPool = new Pool({ connectionString: process.env.REPLICA_DB_URL });
const replicaDb = drizzle(replicaPool);

// Route queries appropriately
async function getUsers() {
  return replicaDb.select().from(users); // Read from replica
}

async function createUser(data: NewUser) {
  return primaryDb.insert(users).values(data).returning(); // Write to primary
}
```

## Monitoring & Profiling

### Query Logging

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle(pool, {
  logger: {
    logQuery(query: string, params: unknown[]) {
      console.log('Query:', query);
      console.log('Params:', params);
    },
  },
});
```
