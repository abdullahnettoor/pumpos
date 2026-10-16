# Role × Permission matrix

Generated from `catalogue.ts` (`npm run permissions:matrix -w @pump/shared`). Do not edit by hand; a test fails if it drifts.

| Area | Permission | Id | Owner | Manager | Accountant | Staff | Attendant | Never delegable | Requires |
| --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| Pages | View Dashboard | `pages.dashboard` | yes | yes | yes | yes | yes | - | - |
| Pages | View Shifts | `pages.shifts` | yes | yes | yes | yes | - | - | - |
| Pages | View Inventory | `pages.inventory` | yes | yes | yes | - | - | - | - |
| Pages | View Pricing | `pages.pricing` | yes | yes | - | - | - | - | - |
| Pages | View Customers | `pages.customers` | yes | yes | yes | yes | yes | - | - |
| Pages | View Suppliers | `pages.suppliers` | yes | yes | yes | - | - | - | - |
| Pages | View Accounts | `pages.accounts` | yes | yes | yes | - | - | - | - |
| Pages | View Expenses | `pages.expenses` | yes | yes | yes | yes | yes | - | - |
| Pages | View Income | `pages.income` | yes | yes | yes | yes | yes | - | - |
| Pages | View Reports | `pages.reports` | yes | yes | yes | - | - | - | - |
| Pages | View Station | `pages.station` | yes | yes | - | - | - | - | - |
| Pages | View Organization | `pages.organization` | yes | - | - | - | - | yes | - |
| Dashboard | See the day timeline, forecourt and fuels | `dashboard.operations` | yes | yes | yes | yes | - | - | - |
| Dashboard | See the "Your shift" card | `dashboard.yourShift` | - | - | - | yes | - | - | - |
| Shifts | Open a shift | `shifts.open` | yes | yes | - | yes | - | - | `pages.shifts` |
| Shifts | Close a shift | `shifts.close` | yes | yes | - | yes | - | - | `pages.shifts` |
| Shifts | Reopen a closed shift | `shifts.reopen` | yes | yes | - | - | - | - | `pages.shifts` |
| Shifts | Close / reopen a business day | `shifts.closeDay` | yes | yes | - | - | - | - | `pages.shifts` |
| Shifts | Work the live shift | `shifts.viewLive` | yes | yes | - | yes | - | - | `pages.shifts` |
| Shifts | Add and review transactions on a shift summary | `shifts.reviewTransactions` | yes | yes | yes | - | yes | - | - |
| Shifts | Record an attendant handover | `handover.record` | yes | yes | yes | yes | yes | - | - |
| Pricing | Change a fuel price | `pricing.change` | yes | yes | - | - | - | - | `pages.pricing` |
| Pricing | Manage products and MRP | `products.manage` | yes | yes | - | - | - | - | `pages.pricing` |
| Expenses | Record and edit expenses | `expenses.create` | yes | yes | yes | yes | - | - | `pages.expenses` |
| Expenses | Adjust a closed expense | `expenses.adjust` | yes | yes | yes | - | - | - | `pages.expenses` |
| Expenses | Void an expense | `expenses.void` | yes | yes | - | - | - | - | `pages.expenses` |
| Expenses | Manage expense categories | `expenses.categories` | yes | yes | yes | - | - | - | `pages.expenses` |
| Income | Record other income | `income.record` | yes | yes | yes | yes | - | - | `pages.income` |
| Inventory | Record purchases and supplier payments | `purchases.record` | yes | yes | yes | - | - | - | `pages.inventory` |
| Inventory | Adjust a closed purchase | `purchases.adjust` | yes | yes | yes | - | - | - | `pages.inventory` |
| Inventory | View purchase prices / costs | `purchases.viewCosts` | yes | yes | yes | - | - | - | `pages.inventory` |
| Inventory | Record decantations | `inventory.decantation` | yes | yes | yes | - | - | - | `pages.inventory` |
| Inventory | Record product density | `inventory.density` | yes | yes | yes | yes | - | - | - |
| Inventory | Record tank dips / stock counts | `inventory.stockCount` | yes | yes | yes | yes | - | - | - |
| Inventory | Review flagged decantations | `inventory.reviewFlagged` | yes | - | - | - | - | - | `pages.inventory` |
| Customers | Create and edit customers | `customers.manage` | yes | yes | yes | - | - | - | `pages.customers` |
| Customers | Change a credit limit | `customers.changeCreditLimit` | yes | yes | - | - | - | - | `pages.customers` |
| Customers | Archive a customer | `customers.archive` | yes | yes | - | - | - | - | `pages.customers` |
| Customers | Record collections | `collections.record` | yes | yes | yes | yes | - | - | `pages.customers` |
| Customers | Adjust a closed collection | `collections.adjust` | yes | yes | yes | - | - | - | `pages.customers` |
| Suppliers | Create and edit suppliers | `suppliers.manage` | yes | yes | yes | - | - | - | `pages.suppliers` |
| Suppliers | Archive a supplier | `suppliers.archive` | yes | yes | - | - | - | - | `pages.suppliers` |
| Accounts | Manage money accounts and view ledgers | `accounts.manage` | yes | yes | yes | - | - | - | `pages.accounts` |
| Reports | View reports and money figures | `reports.view` | yes | yes | yes | - | - | - | `pages.reports` |
| Reports | Generate and export reports | `reports.export` | yes | yes | yes | - | - | - | `reports.view` |
| Reports | View the attendant handover report | `reports.attendant` | yes | yes | yes | - | - | - | `reports.view` |
| Reports | Issue GST tax invoices | `reports.invoice` | yes | yes | yes | - | yes | - | - |
| Reports | View margin | `finance.viewMargin` | yes | - | - | - | - | - | `pages.dashboard` |
| Reports | View profit & loss | `finance.viewProfitLoss` | yes | - | - | - | - | - | `reports.view` |
| Station | Change station setup | `station.manage` | yes | yes | - | - | - | - | `pages.station` |
| Station | Manage tanks, dispensers and nozzles | `station.infrastructure` | yes | yes | - | - | - | - | `pages.station` |
| Station | Run station onboarding | `station.onboard` | yes | yes | - | - | - | - | `pages.station` |
| Station | Manage report templates | `station.reportTemplates` | yes | yes | - | - | - | - | `pages.station` |
| Station | Set tank-level thresholds | `station.tankLevels` | yes | yes | - | - | - | - | `pages.station` |
| Station | Create and provision stations | `station.create` | yes | - | - | - | - | yes | - |
| Team | Add and manage team members | `team.manage` | yes | yes | - | - | - | yes | - |
| Organization | Edit the organization profile | `organization.edit` | yes | - | - | - | - | yes | - |
| Organization | View the activity log | `activity.view` | yes | - | - | - | - | yes | - |
| Organization | See plan and upgrade options | `subscription.viewCommercial` | yes | yes | - | - | - | yes | - |
| Organization | See subscription payment status | `subscription.viewBilling` | yes | yes | yes | - | - | yes | - |
| Mobile | Mobile Home overview | `mobile.home` | yes | yes | - | - | - | - | - |
| Mobile | Mobile Shifts tab | `mobile.shifts` | yes | yes | - | - | - | - | - |
| Mobile | Mobile Insights tab | `mobile.insights` | yes | yes | - | - | - | - | - |
| Mobile | See every alert category | `mobile.fullAlerts` | yes | yes | - | yes | yes | - | - |
| Mobile | Density shortcut in place of the alerts bell | `mobile.densityShortcut` | - | - | yes | - | - | - | - |
