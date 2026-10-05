# Sample Fuels demo walkthrough

Use the dev console deployment with the `Sample Fuels (Demo)` organization. The
demo account is private. Share credentials only for an agreed, short evaluation
and rotate the passwords afterwards.

## Before the call

1. Run `npm run demo:reset -w @pump/db` from `packages/db` with the dev database
   environment loaded. The command checks the Supabase project ref before it
   deletes any rows.
2. Confirm the reset completed and sign in as `owner@demo.pumpos.invalid`.
3. Click through the dashboard, shifts, customer ledger, stock and reports.
   Confirm the business dates use the station's Asia/Kolkata clock.
4. For an attendant handover, use the attendant account on a phone-sized view.
5. Confirm the demo has no real contact details and the follow-up message below
   matches the current offer.

The reset script prints the demo sign-in addresses and dev dashboard URL. Set
passwords through `DEMO_OWNER_PASSWORD`, `DEMO_MANAGER_PASSWORD`,
`DEMO_ACCOUNTANT_PASSWORD`, and `DEMO_ATTENDANT_PASSWORD` in the private dev environment. Do not put passwords
in this document, GitHub Actions logs, or issue comments.

## 15-minute walkthrough

| Time | Screen | What to show |
|---|---|---|
| 0:00–2:00 | Owner dashboard | Start with yesterday's Daily Station Sales Report and the shift variance story. Explain that the report is a saved close snapshot. |
| 2:00–4:00 | Shifts | Open today's evening shift. Show the dispenser assignments and each attendant's opening float. |
| 4:00–6:00 | Attendant handover | Switch to the attendant phone view and review the pending handover. Use the Anitha S / DU-2 shortage story when present. |
| 6:00–8:00 | Stock / tank dip | Show the HSD dip variance and its recorded reason. Explain that the dip is an inventory variance, not a manual sale. |
| 8:00–10:00 | Customer ledger | Show KSRTC Depot Aluva near its credit limit, then Malabar Transports' collection and statement. |
| 10:00–12:00 | Shift close | Complete the remaining handover, close the shift and inspect the immutable Shift Summary. |
| 12:00–13:30 | Business-day close | Close the day and open the saved DSR. Download the PDF. |
| 13:30–15:00 | Owner / office records | Show the owner experience on a phone, then the expense, supplier payment and P&L. Reinforce that office records use entry dates rather than shifts. |

## Two-minute version

1. Show the Owner dashboard and yesterday's saved DSR.
2. Open today's evening shift and point out the pending attendant handover.
3. Show the shortage and HSD dip variance, then the KSRTC customer balance.
4. Open the shift summary and finish on the DSR PDF and office cash book.

## Follow-up message

> Thanks for taking the time to see PumpOS today. The demo covered shift and
> drawer handovers, stock variance, customer credit, and day-close reporting.
> If you'd like to try it with your team, we can discuss Core at ₹0 for the
> first 3 months. Reply here with any questions or a time that works for you.

## Seed coverage note

The seed creates seven prior closed business days with shift summaries and DSR
snapshots, today's closed morning shift and open evening shift, the drawer
shortage, HSD dip variance, credit records, and demo Auth users. It does not yet
populate purchases or office records on every historical day, nor a full set of
cash-drop and terminal handover records. Check those screens before presenting
them, and do not promise a step that is absent from the current dev database.
