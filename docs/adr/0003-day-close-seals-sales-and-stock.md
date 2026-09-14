# Day close seals sales and stock, not the financial ledger

Closing a Business Day exists to protect the day's sales and stock picture (shift
summaries, nozzle-derived volumes, tank stock). Financial-ledger records —
collections, expenses, income, supplier payments, credit sales, opening
balances — routinely arrive after the fact (an owner is informed of a bank
collection days later), so a closed day continues to accept them as flagged
Late Entries. Stock-affecting writes (shift open/reopen, stock counts, tank
dips, purchases, opening stock) are rejected on a closed day: a fuel decant is
a physical same-day event, and if it wasn't recorded before close, that is a
variance to surface, not silently backfill — late purchase invoices are
recorded against an open day instead.

Consequence: the DSSR Snapshot is authoritative for sales/stock and "as of
`generatedAt`" for financials. A snapshot exists iff its day is closed
(open-day DSSR is preview-only, never persisted); `CloseBusinessDay`
regenerates the snapshot at the close moment. Late Entries never mutate an
existing snapshot. The rejected alternative — hard-sealing the whole day —
would force operators to misdate real transactions onto the wrong Business
Day just to record them.
