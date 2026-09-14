# Event activity groups preserve command and causation semantics

Business Events remain immutable audit facts. The owner-facing activity feed
groups the events written by one accepted logical command without changing the
event store or treating sibling facts as a causal chain.

Each new API command receives a correlation ID. Events from that command share
the ID and exactly one is marked `metadata.grouping.role = 'primary'`; the
others are `related`. The primary supplies the compact summary while related
facts load on demand. Existing events without a correlation ID remain
one-event legacy groups and are never backfilled.

`causationId` retains its strict meaning: it identifies an event that directly
triggered a later event. It is not an activity-feed parent pointer, and
co-emitted sibling facts never receive invented causation links.

Presentation data is immutable metadata, separate from business payloads:

```ts
metadata: {
  grouping: { role: 'primary' | 'related' },
  presentation: { templateId, values },
  actorSnapshot: { kind, displayName, role, subjectId? },
}
```

Templates are registered in `@pump/core`, render plain text only, and degrade
to a generic fallback if their data is missing or malformed. Display values
such as customer, supplier, product, account, and user names are captured when
the event is written; historic descriptions must not query mutable master data.

Actor identity is distinct from actor presentation. Tenant events keep their
authoritative `actorId` and snapshot a tenant user. Platform administrators
snapshot their platform identity despite having no tenant `actorId`, and
system actions explicitly use the `system` actor kind. A null actor ID never
implicitly means system.

The activity endpoints remain Owner-only and scope all group queries by
organization. They return rendered event summaries, not raw payloads. The
database enforces at most one primary for each non-null correlated group;
malformed related-only groups are diagnosed rather than silently repaired.
