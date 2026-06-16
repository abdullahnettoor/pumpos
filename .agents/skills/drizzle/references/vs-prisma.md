# Drizzle ORM vs Prisma

Comparative guide for developers transitioning from Prisma to Drizzle ORM.

## Architecture

*   **Prisma**: Uses a Rust-based query engine binary. Heavier bundle size, slower cold starts, but offers a unified schema DSL and highly automated migrations.
*   **Drizzle**: TypeScript-first, zero-dependency, and compiles directly to SQL. Very lightweight, extremely fast execution, perfect for serverless/edge runtimes, and uses regular SQL scripts for migrations.

## Code Comparison

### Schema Definition

**Drizzle** (TS-native):
```typescript
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  authorId: integer('author_id').references(() => users.id).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
```

**Prisma** (Schema DSL):
```prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
```

### Querying

**Drizzle** (SQL-like):
```typescript
import { eq, like, and, gt } from 'drizzle-orm';

// Simple query
const user = await db.select().from(users).where(eq(users.id, 1));

// Complex filtering
const results = await db.select()
  .from(users)
  .where(
    and(
      like(users.email, '%@example.com'),
      gt(users.createdAt, new Date('2024-01-01'))
    )
  );
```

**Prisma** (Fluent API):
```typescript
// Simple query
const user = await prisma.user.findUnique({ where: { id: 1 } });

// Complex filtering
const results = await prisma.user.findMany({
  where: {
    email: { endsWith: '@example.com' },
    createdAt: { gt: new Date('2024-01-01') },
  },
});
```

### Migrations

**Drizzle** (SQL-based):
```bash
# Generate migration
npx drizzle-kit generate

# Output: drizzle/0000_migration.sql
# CREATE TABLE "users" (
#   "id" serial PRIMARY KEY,
#   "email" text NOT NULL UNIQUE
# );

# Apply migration
npx drizzle-kit migrate
```

**Prisma** (Declarative):
```bash
# Generate and apply migration
npx prisma migrate dev --name add_users
```

## Performance Benchmarks

### Query Execution Time (1000 queries)

| Operation | Drizzle | Prisma | Difference |
|-----------|---------|--------|------------|
| findUnique | 1.2s | 3.1s | **2.6x faster** |
| findMany (10 rows) | 1.5s | 3.8s | **2.5x faster** |
| findMany (100 rows) | 2.1s | 5.2s | **2.5x faster** |

### Bundle Size Impact

*   **Drizzle**: ~35KB client overhead
*   **Prisma**: ~230KB client overhead (due to Rust binary wrapper)

## Migration from Prisma to Drizzle

### Pattern Mapping

```typescript
// findUnique
await prisma.user.findUnique({ where: { id: 1 } });
await db.select().from(users).where(eq(users.id, 1));

// create
await prisma.user.create({ data: { email: 'user@example.com' } });
await db.insert(users).values({ email: 'user@example.com' }).returning();

// update
await prisma.user.update({ where: { id: 1 }, data: { name: 'John' } });
await db.update(users).set({ name: 'John' }).where(eq(users.id, 1));
```
