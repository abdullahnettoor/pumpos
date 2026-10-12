# PROTOTYPE: desktop/web shell + Dashboard (throwaway)

Not production code; never merge into `dev`. Open `dashboard-revamp.prototype.html` directly in a browser (no build step).

- `?variant=A|B|C`: A Control Room (echoes the mobile revamp) · B Briefing desk (table-first) · C Ops board (timeline + board).
- `?theme=light|dark`: light is the product default; dark is only a preview of the future rollout.
- Keys: ←/→ change variant, `t` toggles theme, `n` toggles the notes card. `?clean=1` hides the notes card and switcher.

All numbers are mock data for one day (Fri 9 Oct, Shift 1 closed, Shift 2 running).

## Round 2: `dashboard-c.prototype.html`
The chosen direction: C (Ops board) content with B's slim top bar, and the day stepper in the page header.
One dashboard for every web/desktop role, with gated components. `?role=owner|manager|accountant|staff` or ←/→ to switch; the notes card shows the gating table.

## Confirmation round: `dashboard-confirm.prototype.html`
Everything still open before the spec, switchable from the bottom control bar (or URL params):
- **Timeline**: `?tl=auto|off|collapsed|compact|full`. Chosen: `auto` = compact strip from the first shift of the day until its last scheduled shift closes (stays visible between shifts).
- **State**: `?state=busy|late|noshift|firstday|onboarding|arrive|loading|error`. `arrive` replays card-wise loading (chosen: each card has its own request).
- **Width**: `?w=auto|1366|1180|960|760` (three → two → one column, sidebar → icon rail).
- **Data sources**: `?src=1` labels each block with its endpoint and cache tier.
- **Role**: `?role=owner|manager|accountant|staff`.
- **Station switcher**: `?org=multi|single&assigned=one|many`. The breadcrumb is a dropdown only when the user can reach >1 station (Owner: org stations; others: assigned stations).
