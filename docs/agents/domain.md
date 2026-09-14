# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (this repo is single-context)
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.
- Also read **`AGENTS.md`** for hard architectural rules (anchoring, multi-tenancy, event model). `CONTEXT.md` is the shared *language*; `AGENTS.md` is the rulebook. When they disagree, `AGENTS.md` wins and the conflict should be surfaced.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-business-day-anchoring.md
│   └── 0002-shift-vs-day-money-movements.md
├── apps/
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (business-day anchoring), but worth reopening because…_
