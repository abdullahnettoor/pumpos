# OMC card sales settle into a prepaid CMS wallet, not receivables

Fuel sold against an Oil Marketing Company card never touches the cash drawer
and never debits a customer balance. `RecordOmcCardSale`
(`packages/core/src/capabilities/crm/credit-sales`) writes an MIS-only
customer-transactions row (`transactionType: 'OMC Sale'`, customer link
optional), and `LedgerPostingService.postOmcCardSale`
(`apps/api/src/infra/ledger-posting.ts`) posts a `SALE_OMC` money-in Ledger
Entry into a station-level `CMS`-type Financial Account — the **OMC Wallet**.

We chose wallet-style settlement because OMC/fleet money is pre-funded with the
oil company and credited into this dedicated account (fleet customers' deposits
land here too). Modelling it as a station receivable would misstate who owes
whom; modelling it as drawer cash would corrupt shift reconciliation.

**Consequences**: the CMS balance is informational today; reconciling it
against OMC statements arrives with the ledger phase (roadmap `phase-L`).
Voiding an OMC sale reverses by deleting its posted ledger entries.
