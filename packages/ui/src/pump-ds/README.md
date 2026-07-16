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

## Load order (apps must follow this)

```ts
// apps/*/src/main.tsx
import '@pump/ui/src/index.css';            // 1. raw --* variables + legacy classes
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
