# Demo stations: call flow and prospect sandbox

## Running a call demo

Keep one long-lived **Sample Fuels** demonstration organization for calls. Before
each call, use **Reset** in the platform app so the screenshots, numbers and
exceptions start from the same point. The standard walkthrough takes about 15
minutes:

1. **Dashboard (1 min):** orient the prospect to today's business day, the open
   evening shift and the station status.
2. **Evening shift (2 min):** show nozzle readings and the per-attendant drawer
   view. Anitha S on DU-2 has one pending handover with a declared shortage of
   **₹350**. Explain that the attendant variance is separate from the office's
   shift-close cash count.
3. **Inventory (1 min):** open the tank variance list and inspect the **−18 L
   HSD** dip, including its recorded reason.
4. **Credit (2 min):** show a credit fuel sale for Malabar Transports, then its
   single **₹15,000 bank collection** and the customer statement. Fuel is already
   metered at the nozzle; the credit sale only creates a receivable.
5. **Close the shift (2 min):** complete the remaining handover, then close the
   shift and inspect its immutable Shift Summary.
6. **Close the business day (2 min):** close the day and open the saved DSR PDF.
   Point out that it contains sales and stock activity, not office collections
   or expenses.
7. **Owner view (3 min):** switch to the owner login and review the day summary
   and profit-and-loss view.

### Two-minute version

Open the dashboard, point out the pending ₹350 handover, show the −18 L HSD
variance, then open Malabar Transports' statement to connect the credit sale to
the ₹15,000 collection. Finish on the saved DSR.

## A custom sandbox for a prospect

From the platform app, select a non-production API target and choose **Create
demo station**. Enter the prospect's station name and town, then set the tank,
nozzle and attendant counts to match their setup. Add their email if an invite
should be sent. The default access window is **2 days**; choose 7 or 30 days
when the prospect asks for more time. Use **Extend demo** for a later request,
and **Delete demo** when the evaluation is over. Demo organizations are
disposable and are permanently removed after expiry plus a seven-day grace
period.

## WhatsApp follow-up template

> Thanks for taking a look at PumpOS. Here is your demo station: [demo link].
> Access is available until [expiry date]. PumpOS Core is ₹0 for your first
> three months. Reply here if you'd like more time or want to walk through a
> specific workflow.

Do not promise a response time in the message.

## Production database separation

Demo organizations currently live in the shared database. Until production has
its own database, keep the platform UI pointed at **Dev** for demo work. When
production receives its dedicated database/deploy, leave `ALLOW_DEMO_ORGS` unset
or `false` there; it is enabled only under `[env.preview]` in
`apps/api/wrangler.toml`.
