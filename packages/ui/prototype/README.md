# PROTOTYPE: desktop/web shell + Dashboard (throwaway)

Not production code; never merge into `dev`. Open `dashboard-revamp.prototype.html` directly in a browser (no build step).

- `?variant=A|B|C`: A Control Room (echoes the mobile revamp) · B Briefing desk (table-first) · C Ops board (timeline + board).
- `?theme=light|dark`: light is the product default; dark is only a preview of the future rollout.
- Keys: ←/→ change variant, `t` toggles theme, `n` toggles the notes card. `?clean=1` hides the notes card and switcher.

All numbers are mock data for one day (Fri 9 Oct, Shift 1 closed, Shift 2 running).

## Round 2: `dashboard-c.prototype.html`
The chosen direction: C (Ops board) content with B's slim top bar, and the day stepper in the page header.
One dashboard for every web/desktop role, with gated components. `?role=owner|manager|accountant|staff` or ←/→ to switch; the notes card shows the gating table.
