# Core event activity contract

Type: task
Status: planned
Blocked by: none

## Objective

Create the typed event-activity catalog and renderer in `@pump/core` without changing existing business behavior.

## Scope

- Add separate event-grouping, typed event-presentation, explicit actor-snapshot, template, rendered-result, tone, and value-format types.
- Add a presentation catalog covering every `BusinessEventType`.
- Do not rename or remove existing `BusinessEvents`. Allow additive event types found by the later mutation audit, with presentation data and tests in the same change.
- Add versioned template IDs and complete initial copy.
- Add plain-text template rendering and value formatting.
- Add generic fallback rendering for legacy or malformed events.
- Export the module from the core kernel.

## Interface

Keep the public interface small:

```ts
renderEventActivity(event, options?): RenderedEventActivity
getEventActivityDefinition(eventType): EventActivityDefinition
```

Extend `ContextEventInput` with optional grouping role and typed presentation input, but do not require emitters to adopt presentation templates in this ticket.

## Rules

- Registered templates only. Never execute an event-provided template.
- Plain scalar values only.
- Template IDs map to exact value types through a discriminated union or typed helper.
- No HTML output.
- Rendering failures return fallback text and never throw into a business write path.
- Use Indian currency and number formatting by default.
- Template ID and event-type mismatches use fallback text.
- All catalog members must compile against `Record<BusinessEventType, ...>`.

## Tests

- Catalog coverage for all event types.
- Unique template IDs.
- Placeholder and format-definition consistency.
- INR, decimal, quantity, date, and variance formatting.
- Missing value, unknown event type, and unknown template fallback.
- Plain-text injection safety.
- Compile-time fixtures for missing, extra, misspelled, and wrongly typed template values.

## Acceptance criteria

- Adding a new `BusinessEvents` member without catalog presentation data fails TypeScript compilation or a focused test.
- Existing event emitters compile unchanged.
- The renderer has no dependency on React, Hono, Drizzle, or SQL.
- Core tests and build pass.

## Comments

