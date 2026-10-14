# PROTOTYPE: page controls and KPIs (#529 pilot → wave 5), throwaway

Never merge into `dev`. Open `page-controls.prototype.html` in a browser. There is no build step.

**Question:** where do the controls on a page go (date range, search, filters, segmented, export, buttons), where do the KPIs go, and does the KPI tile need a redesign?

URL parameters:
- `?page=expenses|customers|pnl|kit` picks the page:
  - **Expenses:** a ledger (rows in a period).
  - **Customers:** a list of balances (no period).
  - **Reports › P&L:** a report (everything follows the period).
  - **Control vocabulary:** when to use each control.
- `?v=A|B|C|D` picks the layout:
  - **A · Toolbar:** one bar drives everything below it.
  - **B · Section bars:** fixed KPIs on top; the controls sit in the header of the table they filter.
  - **C · Summary line:** no tiles, one line of figures.
  - **D · Tiles as filters:** clicking a tile filters the table.
- `?range=menu|presets|fields` picks the date-range control:
  - **menu:** one button with a popover.
  - **presets:** segmented presets.
  - **fields:** today's select plus two date fields.
- `?kpi=refined|current` picks the KPI tile: today's tile, or the proposed one (period chip, neutral values, colour only for problems).
- `?theme=light|dark`.

**Keys:** ←/→ changes the layout (outside inputs). All data is mock, in memory (Highway Fuels, Wed 14 Oct 2026).
