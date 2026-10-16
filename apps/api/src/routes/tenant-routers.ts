import type { Hono } from 'hono';
import { stationSetupRouter } from './station-setup.js';
import { paymentTerminalsRouter } from './payment-terminals.js';
import { productsRouter } from './products.js';
import { shiftsRouter } from './shifts.js';
import { transactionsRouter } from './transactions.js';
import { decantationsRouter } from './decantations.js';
import { densityRouter } from './density.js';
import { dssrRouter } from './dssr.js';
import { reportsRouter } from './reports.js';
import { financeRouter } from './finance.js';
import { accessRouter } from './access.js';
import { organizationRouter } from './organization.js';

/**
 * Every tenant router and the prefix it is mounted under — the single list
 * `index.ts` mounts from AND the station-tenancy coverage test enumerates
 * (#235). Because mounting goes through this list, a new tenant router cannot
 * reach production without also entering tenancy coverage.
 *
 * (The handful of read endpoints defined inline in `index.ts` — session and
 * activity — are organization-anchored and take no station-resolving path.
 * Mutations do not live inline: `write-policy-coverage.test.ts` reads the
 * whole app's route table, so an undeclared inline mutation fails it.)
 */
export const TENANT_ROUTERS: ReadonlyArray<readonly [string, Hono<any, any, any>]> = [
  ['/setup', stationSetupRouter],
  ['/setup', paymentTerminalsRouter],
  ['/setup', productsRouter],
  ['/shifts', shiftsRouter],
  ['/transactions', transactionsRouter],
  ['/transactions', decantationsRouter],
  ['/transactions', densityRouter],
  ['/dssr', dssrRouter],
  ['/reports', reportsRouter],
  ['/finance', financeRouter],
  // Organization access document (role-filtered, presentation only).
  ['/access', accessRouter],
  // The caller's Organization profile (#616, #626).
  ['/organization', organizationRouter],
];
