---
name: drizzle-orm
description: "Type-safe SQL ORM for TypeScript with zero runtime overhead"
user-invocable: false
disable-model-invocation: true
progressive_disclosure:
  entry_point:
    summary: "Type-safe SQL ORM for TypeScript with zero runtime overhead"
    when_to_use: "When working with drizzle-orm or related functionality."
    quick_start: "1. Review the core concepts below. 2. Apply patterns to your use case. 3. Follow best practices for implementation."
  references:
    - advanced-schemas.md
    - performance.md
    - query-patterns.md
    - vs-prisma.md
---
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
