# Reports visual harness (throwaway, never commit)

Renders the real `ReportsOverview` from `@pump/ui` (live worktree source, not
`dist/`) with stubbed API data for "Highway Fuels, Kochi", October 2026. No
backend, no sign-in. Fixtures are dated relative to the station's business date
(Asia/Kolkata, Day Start 06:00) and filtered by each request's from/to.

## Run

```sh
cd apps/desktop
npx vite --config harness/vite.harness.config.ts
```

Port 1430 (`HARNESS_PORT=1440` to change). `HARNESS_DIST=1` renders the
compiled `packages/*/dist` instead of the sources. Stop with Ctrl-C.

Open `http://localhost:1430/harness.html?…`. When the harness has finished
clicking, `body[data-harness="ready"]` is set (wait for it before a
screenshot). Console errors/warnings are kept in `window.__harnessLog`.

## Parameters

| param | values |
| --- | --- |
| `tab` | `daily-dssr` (default) · `attendant-handovers` · `decantations` · `pnl` · `ledger` · `invoices` · `gst` · `expense-register` |
| `view` | ledger: `party` · `cash-bank`; gst: `sales` · `purchases` · `income` |
| `entity` | party ledger: `cash` · `bank` · `owner` · `customer` · `supplier` |
| `party` | with `entity=customer\|supplier`: substring of the name (default: first in the list) |
| `range` | period preset: `today` · `yesterday` · `last-7` · `this-week` · `this-month` · `last-month` · `last-30` · `this-year` |
| `click` | repeatable; clicks the first button/radio/menu item whose text starts with it (e.g. `click=Show` opens "Other accounts", `click=All accounts`) |
| `open` | `1` clicks the first table row (attendant drawer, decantation visit, DSR day) |
| `theme` | `light` · `dark` |
| `fail` | `1`: every report call answers HTTP 500 (access still loads); `all`: access fails too |

## URLs

```
http://localhost:1430/harness.html?tab=daily-dssr
http://localhost:1430/harness.html?tab=attendant-handovers
http://localhost:1430/harness.html?tab=attendant-handovers&open=1
http://localhost:1430/harness.html?tab=decantations
http://localhost:1430/harness.html?tab=pnl
http://localhost:1430/harness.html?tab=pnl&range=yesterday          (single-day statement)
http://localhost:1430/harness.html?tab=ledger&view=party            (initial "Select a ledger")
http://localhost:1430/harness.html?tab=ledger&view=party&entity=cash
http://localhost:1430/harness.html?tab=ledger&view=party&entity=customer&party=kochi
http://localhost:1430/harness.html?tab=ledger&view=party&entity=supplier&party=indian
http://localhost:1430/harness.html?tab=ledger&view=cash-bank
http://localhost:1430/harness.html?tab=ledger&view=cash-bank&click=Show&click=All%20accounts
http://localhost:1430/harness.html?tab=invoices
http://localhost:1430/harness.html?tab=gst&view=sales
http://localhost:1430/harness.html?tab=gst&view=purchases
http://localhost:1430/harness.html?tab=gst&view=income
http://localhost:1430/harness.html?tab=expense-register
http://localhost:1430/harness.html?tab=ledger&view=cash-bank&fail=1 (error state)
```

Append `&theme=dark` to any of them.

## Files

- `../harness.html` — copy of `index.html` loading `harness/main.tsx`
- `vite.harness.config.ts` — desktop config + port 1430 + source aliases
- `main.tsx` — providers, fake 232px sidebar, AppShell content padding, URL driver
- `fetchStub.ts` — `window.fetch` stub for `http://localhost:8787/api/*`
- `fixtures.ts` — the data
