# Mobile app access by Role

Status: accepted (2026-10-10).

The mobile app (#388 "Control Room") is for owners and managers checking on a
station away from the desk, plus a handover-only app for Attendants. Which tabs
a Role sees is decided in one place, `packages/shared/src/permissions/guards.ts`
(`canViewMobileHome`, `canViewMobileShifts`, `canViewMobileInsights`, with
`canViewReports` and `canManageFinancialAccounts` for Reports and Money). The
server enforces Station access on every read and the Role on every write; the
mobile tab set is a presentation choice on top of that, not a security
boundary.

| Role       | Dock                                   | Home                                             |
| ---------- | -------------------------------------- | ------------------------------------------------ |
| Owner      | Home, Shifts, Reports, Money, Insights | Full overview                                    |
| Manager    | Home, Shifts, Reports, Money, Insights | Full overview (owner decision: same as Owner)    |
| Accountant | Reports, Money                         | Only their handover card, while assigned to a DU |
| Staff      | none                                   | Only their handover card, while assigned to a DU |
| Attendant  | separate handover-only app             | —                                                |

Anyone assigned to a DU on the open Shift reaches their own Handover from a
card pinned on Home; there is no separate "My handover" tab. The alerts bell
appears for every Role that may see alerts (Owner, Manager).

## Considered Options

- **Owner-only Home** (the original mobile app): rejected. Managers run the
  station day to day and need the same overview.
- **A "My handover" tab** for non-owners on a pump: rejected in favour of one
  entry point (the Home card) for everyone.

## Consequences

- Closing a Business Day stays desktop-only for every Role.
- Mobile write actions (team, credit limit, Collection, Supplier Payment) use
  the same server guards as desktop; the mobile app hides what the Role can't
  do, but the server is the authority.

## Amended 2026-10-11 (#476)

Accountants still have no Home overview, but they record Decantations and
density readings. They therefore see Decantation and density alerts (plus their
own handover) in the header bell and Needs attention page, and reach the
Decantations list and Density from the Reports tab. The role-to-alert-category
policy lives in one place (`alertVisibleToRole` in `lib/attention/derive.ts`).
