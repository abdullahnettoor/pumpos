# pump-ds

The canonical PumpOS design system. Every new primitive built as part of the
UI revamp lives under this folder. Old primitives in
`packages/ui/src/components/` are the legacy surface and are replaced one at
a time — never in place.

## Rules of the road

1. **Single source of truth for tokens** stays `packages/ui/src/index.css`.
   `pump-ds/tailwind.css` only mirrors those `--*` variables into Tailwind's
   `@theme` namespace. Change a raw value in one place; both the legacy CSS
   classes and the Tailwind utilities pick it up.

2. **Every primitive must ship with** default, hover, focus-visible, active,
   disabled, loading, and error states. Motion must honor
   `prefers-reduced-motion`. Keyboard-reachable end-to-end.

3. **No `emerald-*` / `violet-*` / `rose-*` / `sky-*` etc. from Tailwind's
   default palette.** Use the tokenized colors: `bg-brand`, `text-ink-strong`,
   `border-border-soft`, `bg-success-bg`, `text-warning-fg`, etc.

4. **Beste (and any other external UI catalog) is inspiration only.** If a
   piece is worth adopting, extract the shape into a `pump-ds/` primitive
   with our naming, our tokens, and our a11y contract. Do not ship an
   anonymous `Calendar4` or `Browser2` into product screens.

5. **Naming maps to the domain, not the catalog.** `BusinessDayPill`, not
   `DatePill4`. `StatusChip`, not `Badge12`.

## Style check

`classGuard.test.ts` scans every source file in `packages/ui/src` (tests
excluded) and counts, per file:

| Rule             | Flags                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| `dead-class`     | Tailwind classes that generate no CSS (`bg-line`, `text-accent`)                     |
| `undefined-var`  | `var(--x)` where `--x` is defined nowhere                                            |
| `raw-color`      | hex / `rgb(a)` in a class or style value, incl. `var(--x, #fff)` fallbacks           |
| `palette-class`  | Tailwind's default palette (`text-gray-500`, `bg-blue-600`, `text-white`)            |
| `fill-text-pair` | a solid fill with the wrong `text-on-*` (`bg-danger-fg text-on-brand`, `hover:` too) |

Plain CSS classes defined in `index.css` are allowed. PDF documents
(`@react-pdf/renderer`, `pdfmake`) may use hex: they have no CSS variables.

```sh
npm run test:classes -w @pump/ui          # run the check (CI runs it too)
npm run test:classes:update -w @pump/ui   # lower the allow-list after a fix
```

Today's violations are recorded in `class-guard/allowlist.json` as
`rule → file → count`. The check fails when a file gains a violation, when a
file not on the list has one, and when a file has **fewer** than its entry.

**Lowering an entry.** After fixing violations, run `test:classes:update` and
commit the rewritten `allowlist.json`. The command only ever lowers entries and
drops them at zero; it never raises or adds one, so a new violation has to be
fixed, not listed. If two PRs conflict in `allowlist.json`, take either side and
re-run the command on the merged branch.

## Load order (apps must follow this)

```ts
// apps/*/src/main.tsx
import '@pump/ui/src/index.css'; // 1. raw --* variables + legacy classes
import '@pump/ui/src/pump-ds/tailwind.css'; // 2. Tailwind + @theme bridge over the raw variables
```

Reversing the order breaks the theme bridge — Tailwind's `@theme` block
references CSS variables that must already exist on `:root`.

## Folder shape

```
pump-ds/
  index.ts         — barrel export
  tailwind.css     — Tailwind entry + token bridge (do not edit lightly)
  README.md        — this file
  _smoke/          — verification component that proves the stack is wired
  <primitive>/     — one folder per primitive: <Primitive>.tsx (+ optional .css)
```
