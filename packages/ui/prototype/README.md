# PROTOTYPE: Office Record entry (#526), throwaway

Not production code; never merge into `dev`. Open `office-record-entry.prototype.html` directly in a browser (no build step).

**Question:** what does recording an Office Record (expense, income, collection, purchase, supplier payment) look like, and does it work the same from every entry point?

- `?v=A|B|C|C2`
  - **A**, Form drawer: one kind per drawer, stacked fields, pinned footer, "Add another after saving".
  - **B**, Record desk: a wider drawer with a kind switch (from the New menu) and a log of what you saved; stays open.
  - **C**, Preview drawer: the form, plus a live "what this records" pane with balances before and after, the ledger lines and checks.
  - **C2**, Preview, compact: C in a 560px drawer. The preview is a strip above Save that you can expand, and it moves beside the form on screens 1600px and wider. `?pv=auto|below|side` forces either layout.
- `?kind=expense|income|collection|purchase|payment`
- `?from=page|new|statement|shifts`: page button, top-bar New menu, customer/supplier statement (party fixed), Shifts hotkey.
- `?role=owner|manager|accountant|staff` (Staff can't record purchases or supplier payments).
- `?theme=light|dark`

**Controls:**
- **Keys:** ←/→ changes the variant (outside inputs), ⌘/Ctrl+Enter saves, Esc closes.
- **Fail next save:** the next save fails as if offline. The retry reuses the same Idempotency-Key.
- **Notes card:** explains the variant and lists the open decisions. It also shows the exact body and key that Save would send, which is the same from every entry point.

All data is mock and lives in memory (Highway Fuels, Wed 14 Oct 2026). A seeded Electricity ₹4,200 today triggers the repeat check in C.
