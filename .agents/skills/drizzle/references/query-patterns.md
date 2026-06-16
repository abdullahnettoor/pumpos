# Query Patterns

Common query patterns and operations implemented in Drizzle ORM.

## Conditional Joins

```typescript
import { eq, and, sql } from 'drizzle-orm';

function joinComments(isActive: boolean) {
  return isActive 
    ? eq(posts.id, comments.postId)
    : and(eq(posts.id, comments.postId), eq(comments.isApproved, true));
}

const postsWithComments = await db
  .select()
  .from(posts)
  .leftJoin(comments, joinComments(true));
```

### Dynamic WHERE Clauses

```typescript
import { and, SQL, eq, like } from 'drizzle-orm';

interface Filters {
  name?: string;
  role?: string;
  isActive?: boolean;
}

function buildFilters(filters: Filters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.name) {
    conditions.push(like(users.name, `%${filters.name}%`));
  }

  if (filters.role) {
    conditions.push(eq(users.role, filters.role));
  }

  if (filters.isActive !== undefined) {
    conditions.push(eq(users.isActive, filters.isActive));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// Usage
const filters: Filters = { name: 'John', isActive: true };
const users = await db
  .select()
  .from(users)
  .where(buildFilters(filters));
```

## Aggregations

### Basic Aggregates

```typescript
import { count, sum, avg, min, max, sql } from 'drizzle-orm';

// Count
const userCount = await db.select({ count: count() }).from(users);

// Sum
const totalRevenue = await db.select({ total: sum(orders.amount) }).from(orders);

// Average
const avgPrice = await db.select({ avg: avg(products.price) }).from(products);
```

### GROUP BY with HAVING

```typescript
// Authors with more than 5 posts
const prolificAuthors = await db
  .select({
    author: authors.name,
    postCount: count(posts.id),
  })
  .from(authors)
  .leftJoin(posts, eq(authors.id, posts.authorId))
  .groupBy(authors.id)
  .having(sql`COUNT(${posts.id}) > 5`);
```

### Window Functions

```typescript
// Rank products by price within category
const rankedProducts = await db
  .select({
    product: products,
    priceRank: sql<number>`RANK() OVER (PARTITION BY ${products.categoryId} ORDER BY ${products.price} DESC)`,
  })
  .from(products);
```

## Prepared Statements

### Reusable Queries

```typescript
// Prepare once, execute many times
const getUserById = db
  .select()
  .from(users)
  .where(eq(users.id, sql.placeholder('id')))
  .prepare('get_user_by_id');

// Execute with different parameters
const user1 = await getUserById.execute({ id: 1 });
const user2 = await getUserById.execute({ id: 2 });
```

## Batch Operations

### Batch Insert

```typescript
// Insert multiple rows
const newUsers = await db.insert(users).values([
  { email: 'user1@example.com', name: 'User 1' },
  { email: 'user2@example.com', name: 'User 2' },
  { email: 'user3@example.com', name: 'User 3' },
]).returning();

// Batch with onConflictDoNothing
await db.insert(users).values(bulkUsers).onConflictDoNothing();
```

### Batch Update

```typescript
// Update multiple specific rows
await db.transaction(async (tx) => {
  for (const update of updates) {
    await tx.update(users)
      .set({ name: update.name })
      .where(eq(users.id, update.id));
  }
});
```

### Batch Delete

```typescript
import { inArray } from 'drizzle-orm';

// Delete multiple IDs
await db.delete(users).where(inArray(users.id, [1, 2, 3, 4, 5]));
```

## LATERAL Joins

```typescript
// Get top 3 posts for each author
const authorsWithTopPosts = await db
  .select({
    author: authors,
    post: posts,
  })
  .from(authors)
  .leftJoin(
    sql`LATERAL (
      SELECT * FROM ${posts}
      WHERE ${posts.authorId} = ${authors.id}
      ORDER BY ${posts.views} DESC
      LIMIT 3
    ) AS ${posts}`,
    sql`true`
  );
```

## UNION Queries

```typescript
// Combine results from multiple queries
const allContent = await db
  .select({ id: posts.id, title: posts.title, type: sql<string>`'post'` })
  .from(posts)
  .union(
    db.select({ id: articles.id, title: articles.title, type: sql<string>`'article'` })
      .from(articles)
  );
```

## Distinct Queries

```typescript
// DISTINCT
const uniqueRoles = await db.selectDistinct({ role: users.role }).from(users);
```

## Locking Strategies

```typescript
// FOR UPDATE (pessimistic locking)
await db.transaction(async (tx) => {
  const user = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  // Critical section - user row is locked
  await tx.update(users)
    .set({ balance: user.balance - amount })
    .where(eq(users.id, userId));
});
```
