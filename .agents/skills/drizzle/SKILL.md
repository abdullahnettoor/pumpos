---
name: drizzle-orm
description: "PumpOS schema-change workflow plus Drizzle ORM reference. Use when editing packages/db/src/schema.ts, adding or changing a migration, touching supabase/migrations, or writing CREATE POLICY / TRIGGER / FUNCTION SQL."
user-invocable: false
progressive_disclosure:
  entry_point:
    summary: "PumpOS schema-change workflow plus Drizzle ORM reference"
    when_to_use: "Editing schema.ts, adding a migration, touching supabase/migrations, or writing RLS/trigger/function SQL."
    quick_start: "Follow 'PumpOS schema changes' below before anything else."
  references:
    - advanced-schemas.md
    - performance.md
    - query-patterns.md
    - vs-prisma.md
---

# PumpOS schema changes

`packages/db/migrations` (the drizzle journal) is the single migration source.
`supabase/migrations` is a build artifact derived from it. Commands and the
recreate-don't-migrate policy: `packages/db/README.md`.

Checklist for every schema change. Each step ends when its command is green:

1. **Declare** it in `packages/db/src/schema.ts`: tables, columns, FKs,
   checks, and indexes, including partial (`.where(sql\`…\`)`) and expression
   indexes.
2. **Generate** in the same change: `npm run db:generate -w @pump/db`. This
   writes the journaled migration + snapshot and re-derives
   `supabase/migrations`.
3. **Non-declarative SQL** (RLS policies, `ENABLE ROW LEVEL SECURITY`,
   triggers, functions, grants, data backfills) goes in its own custom
   migration: `npm run db:generate:custom -w @pump/db -- <name>`, write the SQL,
   then `npm run db:sync-supabase -w @pump/db`. A new table's
   `ENABLE ROW LEVEL SECURITY` + tenant policy belong in the same change as
   the table.
4. **Verify**: `npx tsc -b && npm run db:check -w @pump/db` passes. It proves
   schema.ts has no ungenerated change, no generated SQL was edited, and
   `supabase/migrations` matches its derivation.
5. **Commit** schema.ts, the new `migrations/*.sql`, `migrations/meta/*`, and
   the re-derived `supabase/migrations/*` together.

A generated migration is output: to change it, change schema.ts and
regenerate. Files in `supabase/migrations` come only from
`db:sync-supabase`.

## Failure modes this workflow exists to prevent (#268)

- **Hand-pruned generated SQL (0008).** A generated migration had columns
  removed from its SQL while its snapshot kept them. `drizzle-kit generate`
  compares schema.ts to the snapshot, so it kept reporting "no changes"
  while every fresh database lacked the columns, and the API failed at
  runtime. `db:check` now regenerates each migration from its snapshots and
  fails on any difference.
- **One-chain-only SQL (4f19336).** The RLS rewrite was written straight into
  `supabase/migrations`, so the drizzle chain that provisions real databases
  never ran it: the preview DB shipped with RLS disabled on all 45 tables,
  readable with the publishable key. `supabase/migrations` is now derived and
  CI fails on any file the derivation does not produce.

# Drizzle ORM

Modern TypeScript-first ORM with zero dependencies, compile-time type safety, and SQL-like syntax. Optimized for edge runtimes and serverless environments.

## Quick Start

### Installation

```bash
# Core ORM
npm install drizzle-orm

# Database driver (choose one)
npm install pg            # PostgreSQL
npm install mysql2        # MySQL
npm install better-sqlite3 # SQLite

# Drizzle Kit (migrations)
npm install -D drizzle-kit
```

### Basic Setup

```typescript
// db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// db/client.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

### First Query

```typescript
import { db } from './db/client';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

// Insert
const newUser = await db.insert(users).values({
  email: 'user@example.com',
  name: 'John Doe',
}).returning();

// Select
const allUsers = await db.select().from(users);

// Where
const user = await db.select().from(users).where(eq(users.id, 1));

// Update
await db.update(users).set({ name: 'Jane Doe' }).where(eq(users.id, 1));

// Delete
await db.delete(users).where(eq(users.id, 1));
```

## Schema Definition

### Column Types Reference

| PostgreSQL | MySQL | SQLite | TypeScript |
|------------|-------|--------|------------|
| `serial()` | `serial()` | `integer()` | `number` |
| `text()` | `text()` | `text()` | `string` |
| `integer()` | `int()` | `integer()` | `number` |
| `boolean()` | `boolean()` | `integer()` | `boolean` |
| `timestamp()` | `datetime()` | `integer()` | `Date` |
| `json()` | `json()` | `text()` | `unknown` |
| `uuid()` | `varchar(36)` | `text()` | `string` |

### Common Schema Patterns

```typescript
import { pgTable, serial, text, varchar, integer, boolean, timestamp, json, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: text('role', { enum: ['admin', 'user', 'guest'] }).default('user'),
  metadata: json('metadata').$type<{ theme: string; locale: string }>(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: unique('email_unique_idx').on(table.email),
}));

// Infer TypeScript types
type User = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;
```

## Relations

### One-to-Many

```typescript
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const authors = pgTable('authors', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  authorId: integer('author_id').references(() => authors.id).notNull(),
});

export const authorsRelations = relations(authors, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(authors, {
    fields: [posts.authorId],
    references: [authors.id],
  }),
}));
```
