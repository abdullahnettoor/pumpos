# PROTOTYPE: mobile UI revamp (throwaway)

Primary source for spec #388. Not production code; never merge into `dev`.
Open any file directly in a browser (no build step needed).

- `control-room.prototype.html`: the chosen design. Every page in light (default) and dark.
  Use the floating bar or ←/→ to move between pages, and `t` to toggle the theme.
  URL params: `?page=<id>`, `?theme=light|dark`, `?page=all&tall=1` (all pages side by side, full length).
  Page ids: `home`, `shifts`, `shift-detail`, `reports`, `report-detail`, `money`, `customer-detail`,
  `money-pay`, `supplier-detail`, `insights`, `alerts`, `home-assigned`, `handover`, `attendant`,
  `attendant-done`, `attendant-idle`, `attendant-account`, `account`.
- `home-variants.prototype.html`: round 1. Home variants A Briefing / B Control room (chosen) / C Day story.
- `home-b-variations.prototype.html`: round 2. B1 Bento+ / B2 Forecourt / B3 Instrument (all rejected in favour of the original B).

All numbers are mock data.
