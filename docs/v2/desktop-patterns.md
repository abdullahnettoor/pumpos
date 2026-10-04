# Desktop Patterns (`apps/desktop`)

The desktop app is a **Tauri v2** shell that shares `@pump/ui` with the operational
console. It also owns native window behavior, signed in-app updates, and bundled
desktop assets. Keep business UI shared; put native behavior behind explicit platform
seams.

```
apps/desktop/
  src/                 React shell, environment selection, title bar, update flow
  src-tauri/           Rust shell, platform config, capabilities and plugins
```

## Shared with the console

- Same `@pump/ui` components, `cloud.ts` service layer, query hooks, Supabase auth.
- Same `main.tsx` wrapping: `<ErrorBoundary><QueryProvider><App/></QueryProvider></ErrorBoundary>`.

## Build / run

```bash
npm run dev --workspace=apps/desktop      # vite dev (Tauri devUrl)
# Tauri build is driven by tauri.conf.json (beforeBuildCommand: npm run build)
```

`tauri.conf.json` sets `frontendDist: ../dist`, a single main window, and
`capabilities: ["default"]`.

## Platform seams

Native behavior is registered by the desktop shell through interfaces exposed by
`@pump/ui`; shared screens do not import Tauri APIs directly. Existing seams include
the title bar and PDF output. Keep future platform-specific behavior behind the same
injection pattern.

| Capability             | Console behavior       | Desktop behavior                          |
| ---------------------- | ---------------------- | ----------------------------------------- |
| Title bar              | Browser chrome         | Native overlay/custom controls + dragging |
| Report PDF output      | Browser download/print | Native save/print integration             |
| App updates            | Web deployment         | Signed Tauri updater                      |
| Connectivity indicator | Browser network events | WebView network events                    |

## Guidance

- Keep desktop-specific logic out of shared business screens; register it at the shell
  boundary and retain a browser-safe behavior where relevant.
- The desktop ships its UI and assets locally. Durable queued writes and replay are still
  planned work; `navigator.onLine` is only a connectivity signal, not proof of sync state.
- Verify both console and Tauri builds when changing shared shell components.
