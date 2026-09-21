# Platform admin UI (local only)

A browser front for the `/platform/*` API routes — the same operations as
`packages/db/platform.mjs`, without having to remember the commands or paste
organization UUIDs.

**This app is never deployed.** There is no `wrangler.toml`, no `deploy`
script, and no hosting config, on purpose: it drives destructive platform
operations (suspend an organization, revoke an owner, change a plan) and the
only sensible place for it is your own machine. If you ever feel like wiring it
to a domain, add authentication and authorization worth the name first — right
now the only thing standing between a visitor and production is the API's
`PLATFORM_ADMIN_EMAILS` allow-list.

## Running it

```sh
npm run dev:platform   # http://127.0.0.1:5173
```

That is the whole command. A `predev` hook builds `@pump/ui` first, so the app
never starts against a stale `dist` — `tsc -b` is incremental, so it costs
about a second once the package is warm.

Sign in with a platform-admin email and password. The environment (Local / Dev /
Production) is picked on the sign-in screen and shown on every page after it;
production is coloured red.

Two constraints worth knowing before you change anything:

- **Port 5173 is fixed.** The API's CORS allow-list
  (`apps/api/src/infra/cors.ts`) names it explicitly. On another port the
  browser blocks every call and reports it as an unhelpful "network error".
- **The session is in memory only.** Reloading signs you out. That is
  deliberate for a console whose buttons suspend live station networks.

## Configuration

Defaults work out of the box. Override per machine with a `.env.local`:

```sh
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Both environments authenticate against the same Supabase project, so there is
one sign-in config regardless of the selected API target.

## Scope

Exact parity with `platform.mjs`, nothing more. Every button maps to an
endpoint that already exists:

| Screen                       | CLI equivalent                                            |
| ---------------------------- | --------------------------------------------------------- |
| Organizations table          | `owners list`                                             |
| Invite owner                 | `owners invite` (both modes)                              |
| Drawer → Owner               | `owners resend \| revoke \| deactivate \| reactivate`     |
| Drawer → Capabilities        | `organization capability grant \| revoke`                 |
| Drawer → Limits              | `organization limit set \| clear`                         |
| Drawer → Plan & subscription | `organization plan \| subscription \| suspend \| restore` |

The CLI stays as it is. It is the fallback for when this app is broken, and for
anything scripted.
