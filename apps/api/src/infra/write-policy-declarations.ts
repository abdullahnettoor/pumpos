import { declareWritePolicies, type WritePolicyRegistry } from '@pump/core';

/**
 * The Restricted Access matrix: every tenant mutation, and whether an
 * Organization under Restricted Access may still perform it.
 *
 * Restricted Access exists so a station that is mid-day can finish safely.
 * Sales, readings, financial entries, stock operations, handover, Shift close
 * and Business Day close continue; growth, setup changes, invitations and
 * premium actions stop. The HTTP method says nothing useful about which is
 * which — `POST /shifts/close` and `POST /stations` are both writes — so each
 * route states its own answer here.
 *
 * Keys are `METHOD path` exactly as the router registers them, which is what
 * `write-policy-coverage.test.ts` enumerates: adding a mutation without adding
 * a line here fails that test rather than silently inheriting a default.
 *
 * Every route listed here carries `writePolicyGuard`, and the per-family
 * coverage tests check both directions: a mutation without a declaration
 * fails, and so does a declaration whose route no longer exists.
 */
export const WRITE_POLICY_DECLARATIONS: WritePolicyRegistry = declareWritePolicies([
  // ---------------------------------------------------------------------
  // Shift and Business Day lifecycle (#169)
  // ---------------------------------------------------------------------
  {
    operation: 'POST /shifts/open',
    restricted: 'BLOCKED',
    rationale: 'A new Shift is new work, not the completion of open work.',
  },
  {
    operation: 'PUT /shifts/readings',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Nozzle readings are how the open Shift is reconciled and closed.',
  },
  {
    operation: 'POST /shifts/close',
    restricted: 'FINISH_OPEN_WORK',
    rationale:
      'Drawer accountability must be settled; an unclosed Shift is worse than an unpaid invoice.',
  },
  {
    operation: 'POST /shifts/handovers',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'The attendant handover is part of closing the Shift safely.',
  },
  {
    operation: 'POST /shifts/lock',
    restricted: 'FINISH_OPEN_WORK',
    rationale:
      'Locking seals an already-closed Shift; it completes the day rather than extending it.',
  },
  {
    operation: 'POST /shifts/reopen',
    restricted: 'BLOCKED',
    rationale: 'Reopening a sealed Shift is an administrative correction, not finishing open work.',
  },
  {
    operation: 'POST /shifts/business-day/open',
    restricted: 'BLOCKED',
    rationale:
      'Opening a new Business Day starts new trading; Restricted Access is meant to stop that.',
  },
  {
    operation: 'POST /shifts/business-day/close',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'The open day must be closable, or its stock and cash never reconcile.',
  },

  // ---------------------------------------------------------------------
  // Sales, stock and reporting (#170)
  // ---------------------------------------------------------------------
  {
    operation: 'POST /transactions/sales',
    restricted: 'FINISH_OPEN_WORK',
    rationale:
      'Fuel already dispensed must be recorded; refusing the sale loses the money, not the fuel.',
  },
  {
    operation: 'POST /transactions/sales/:id/invoice',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'A customer who has taken fuel is entitled to the invoice for it.',
  },
  {
    operation: 'POST /transactions/inventory/count',
    restricted: 'FINISH_OPEN_WORK',
    rationale:
      'Stock counts are how variance is explained at close; blocking them corrupts the day.',
  },
  {
    operation: 'POST /transactions/shifts/:id/merchandise-handover',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Merchandise handover settles cash the attendant already holds.',
  },
  {
    operation: 'DELETE /transactions/merchandise-handovers/:saleId',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Correcting a mis-keyed handover is part of getting the open day right.',
  },
  {
    operation: 'DELETE /transactions/credit-sales/:id',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Voiding a mistaken credit sale corrects the open day rather than extending it.',
  },
  {
    operation: 'DELETE /transactions/omc-card-sales/:id',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Same as any same-day correction: the drawer has to balance.',
  },
  {
    operation: 'POST /dssr/daily/generate',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'The DSSR is the closing snapshot of the day being finished.',
  },

  // ---------------------------------------------------------------------
  // Financial operations (#171)
  // ---------------------------------------------------------------------
  {
    operation: 'POST /transactions/collections',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Money handed over by a customer must be recorded when it is received.',
  },
  {
    operation: 'POST /transactions/expenses',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'A drawer expense already paid out has to be in the reconciliation.',
  },
  {
    operation: 'POST /transactions/expenses/:id/void',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Voiding a mis-keyed expense is part of closing the day correctly.',
  },
  {
    operation: 'POST /transactions/income',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Other income received today belongs in today’s reconciliation.',
  },
  {
    operation: 'POST /transactions/income/:id/void',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Same-day correction of an entry that is already on the books.',
  },
  {
    operation: 'POST /transactions/purchases',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'A tanker that has already been decanted must be recorded, or stock is wrong.',
  },
  {
    operation: 'POST /transactions/supplier-payments',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Cash paid to a supplier leaves the drawer whether or not PumpOS records it.',
  },
  {
    operation: 'POST /finance/transfers',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Cash drops and bank transfers move money that has already moved physically.',
  },
  {
    operation: 'POST /finance/settlements',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'Card/UPI settlements clear what the acquirer has already paid.',
  },
  {
    operation: 'POST /finance/accounts/:id/entry',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'A ledger entry records a movement that has happened.',
  },
  {
    operation: 'POST /finance/accounts',
    restricted: 'BLOCKED',
    rationale: 'Creating an account is setup, not the completion of open work.',
  },
  {
    operation: 'PUT /finance/accounts/:id',
    restricted: 'BLOCKED',
    rationale: 'Editing an account is a setup change.',
  },
  {
    operation: 'PUT /finance/accounts/:id/opening',
    restricted: 'BLOCKED',
    rationale: 'Restating an opening balance is a setup change with financial reach.',
  },

  // ---------------------------------------------------------------------
  // Setup and administration (#168)
  // ---------------------------------------------------------------------
  {
    operation: 'POST /setup/pricing',
    restricted: 'FINISH_OPEN_WORK',
    rationale:
      'Fuel prices change daily and are set by the OMC; a stale price makes every subsequent sale wrong. This is operations, not setup.',
  },
  ...(
    [
      [
        'POST /setup/stations',
        'Onboarding a Station is growth, which is exactly what Restricted Access stops.',
      ],
      ['PUT /setup/stations/:id', 'Station configuration is a setup change.'],
      ['POST /setup/onboarding/finalize', 'Provisioning a new Station is growth.'],
      ['POST /setup/onboarding/complete', 'Completing onboarding finalises new-Station setup.'],
      ['POST /setup/tanks', 'Infrastructure setup.'],
      ['PUT /setup/tanks/:id', 'Infrastructure setup.'],
      ['DELETE /setup/tanks/:id', 'Infrastructure setup.'],
      ['POST /setup/dispensers', 'Infrastructure setup.'],
      ['PUT /setup/dispensers/:id', 'Infrastructure setup.'],
      ['DELETE /setup/dispensers/:id', 'Infrastructure setup.'],
      ['POST /setup/nozzles', 'Infrastructure setup.'],
      ['PUT /setup/nozzles/:id', 'Infrastructure setup.'],
      ['DELETE /setup/nozzles/:id', 'Infrastructure setup.'],
      ['POST /setup/shift-templates', 'Shift structure is setup.'],
      ['PUT /setup/shift-templates/:id', 'Shift structure is setup.'],
      ['DELETE /setup/shift-templates/:id', 'Shift structure is setup.'],
      ['POST /setup/payment-terminals', 'Terminal registration is setup.'],
      ['PUT /setup/payment-terminals/:id', 'Terminal registration is setup.'],
      ['DELETE /setup/payment-terminals/:id', 'Terminal registration is setup.'],
      [
        'POST /setup/users',
        'Inviting a team member is explicitly blocked under Restricted Access.',
      ],
      ['PUT /setup/users/:id', 'Team administration is blocked.'],
      ['POST /setup/users/:id/reset-password', 'Team administration is blocked.'],
      ['POST /setup/users/:id/deactivate', 'Team administration is blocked.'],
      ['POST /setup/users/:id/reactivate', 'Team administration is blocked.'],
      ['POST /setup/products', 'Master data is setup.'],
      ['POST /setup/products/import', 'Master data is setup.'],
      ['PUT /setup/products/:id', 'Master data is setup.'],
      ['DELETE /setup/products/:id', 'Master data is setup.'],
      ['POST /transactions/customers', 'Master data is setup.'],
      ['PUT /transactions/customers/:id', 'Master data is setup.'],
      ['DELETE /transactions/customers/:id', 'Master data is setup.'],
      ['POST /transactions/customers/:id/vehicles', 'Master data is setup.'],
      ['PUT /transactions/vehicles/:id', 'Master data is setup.'],
      ['DELETE /transactions/vehicles/:id', 'Master data is setup.'],
      ['POST /transactions/suppliers', 'Master data is setup.'],
      ['PUT /transactions/suppliers/:id', 'Master data is setup.'],
      ['DELETE /transactions/suppliers/:id', 'Master data is setup.'],
      ['POST /transactions/expense-categories', 'Master data is setup.'],
      ['PUT /transactions/expense-categories/:id', 'Master data is setup.'],
      ['POST /transactions/income-categories', 'Master data is setup.'],
      ['PUT /transactions/income-categories/:id', 'Master data is setup.'],
    ] as const
  ).map(([operation, rationale]) => ({
    operation,
    restricted: 'BLOCKED' as const,
    rationale,
  })),
]);
