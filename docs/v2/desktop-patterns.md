# Desktop Patterns (`apps/desktop`)

The desktop app is a **Tauri v2** shell that renders the exact same React tree as the web
app, consuming `@pump/ui`. It is currently a thin wrapper — the strategy is **web-first**:
build and verify on `apps/web`, then pull to desktop with near-zero effort because both
shells consume the same component library.

```
apps/desktop/
  src/                 App.tsx (≈ identical to apps/web), main.tsx, vite-env.d.ts
  src-tauri/           Rust shell
    tauri.conf.json    window + build config
    capabilities/      permission capabilities (default.json)
    src/               Rust entry (scaffolding)
```

## What it shares with web

- Same `@pump/ui` components, `cloud.ts` service layer, query hooks, Supabase auth.
- Same `main.tsx` wrapping: `<ErrorBoundary><QueryProvider><App/></QueryProvider></ErrorBoundary>`.

## Build / run

```bash
npm run dev --workspace=apps/desktop      # vite dev (Tauri devUrl)
# Tauri build is driven by tauri.conf.json (beforeBuildCommand: npm run build)
```

`tauri.conf.json` sets `frontendDist: ../dist`, a single main window, and
`capabilities: ["default"]`.

## Where platform seams go (when needed)

Today the desktop app uses no native APIs. When platform-specific behavior is required,
**abstract it behind an interface in `@pump/ui`** with a web implementation now and a
Tauri implementation later — so screens never call Tauri APIs directly. Likely seams:

| Capability | Web impl | Desktop (Tauri) impl |
|---|---|---|
| Printing (shift summary / DSSR) | `window.print()` | native print / PDF export |
| Local storage / resilience outbox | IndexedDB (future) | SQLite via Tauri (future) |
| File export (reports) | download blob | native save dialog |
| Keyboard shortcuts | web handlers | native menu accelerators |

## Guidance

- Keep desktop-specific logic out of `@pump/ui` components; inject platform capabilities
  via props/context with a default web implementation.
- The only expected long-term divergence is **network resilience** (Level 2 —
  graceful degradation, deferred — see [open-questions.md](open-questions.md)).
  Not offline-first. Until then, desktop == web in a window.
- Reconcile the desktop shell after web feature work lands; do not fork screens.
