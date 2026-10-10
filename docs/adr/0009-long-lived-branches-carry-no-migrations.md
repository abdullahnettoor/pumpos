# Long-lived feature branches carry no migrations

Status: accepted (2026-10-10).

The mobile revamp (#388) was built on a long-lived integration branch,
`feature/mobile-revamp`, and released to `dev` in one merge. Drizzle migrations
are numbered in one sequence (`packages/db/migrations`). A migration held on a
long branch would collide with migrations added on `dev` in the meantime. So
**every schema or index change goes straight to `dev` in its own small PR**,
and `dev` is merged back into the integration branch. The revamp's ledger
range (#418) and its indexes (#424, #425, #434, #438) shipped this way, ahead
of the screens that use them. They are additive, so it was safe to deploy them
early.

## Consequences

- A feature PR that needs an index reports the exact `schema.ts` change rather
  than generating a migration on its branch.
- `dev` can carry indexes or columns that no released screen uses yet. That is
  expected.
- Index migrations created without `CONCURRENTLY` lock the table while they
  build. Check that before applying them to a large live database.
