import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import { canManageFinancialAccounts, canViewAttendantReport, canViewReports } from '@pump/shared';
import {
  ATTENDANT_REPORT_CAPABILITY,
  GetAttendantHandoverReport,
  GetCustomerReceivable,
  GetInsightsSales,
  GetReceivables,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { requireCapabilityGuard } from '../infra/capability-guard.js';
import { DrizzleAttendantHandoverReportReader } from '../infra/repositories/attendant-report-repositories.js';
import { DrizzleInsightsSalesReader } from '../infra/repositories/insights-repositories.js';
import { DrizzleReceivablesReader } from '../infra/repositories/receivables-repositories.js';
import { requireStationRead } from '../infra/station-read-guard.js';
import { sendResult } from '../infra/send-result.js';
import { loadStationClock, stationNotFound } from '../infra/station-clock.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const reportsRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /api/reports/attendant-handovers?stationId=&from=&to=&attendantId=
 *
 * Read-only, so it carries no write-policy declaration. Gate order mirrors the
 * access model: the Organization's entitlement first (may this Organization
 * have the feature at all?), then the user's Role.
 */
reportsRouter.get(
  '/attendant-handovers',
  requireCapabilityGuard(ATTENDANT_REPORT_CAPABILITY),
  async (c) => {
    const user = c.var.user;
    const scope = requireStationRead(
      c,
      canViewAttendantReport,
      'Insufficient permissions to view the Attendant Handover Report',
    );
    if (scope instanceof Response) return scope;
    const { stationId } = scope;

    const from = c.req.query('from') ?? '';
    const to = c.req.query('to') ?? '';
    const attendantId = c.req.query('attendantId') || undefined;
    // The date range is the use case's to validate: it owns the rule that
    // `from` may not follow `to`.
    const result = await new GetAttendantHandoverReport({
      reader: new DrizzleAttendantHandoverReportReader(c.var.db),
    }).execute({ stationId, from, to, attendantId }, buildContext(user, { stationId }));

    return sendResult(c, result);
  },
);

/**
 * GET /api/reports/insights/sales?stationId=&days=7|30|90
 *
 * The mobile Insights tab's sales block: trend, product mix and Shift
 * performance over the last `days` CLOSED Business Days vs the previous equal
 * period. Read-only, sealed data only (closed-day DSSR snapshots + Shift
 * Summaries), aggregated in one SQL statement — see the reader. Open to the
 * roles that can view Reports.
 */
reportsRouter.get('/insights/sales', async (c) => {
  const user = c.var.user;
  const scope = requireStationRead(c, canViewReports, 'Insufficient permissions to view Insights');
  if (scope instanceof Response) return scope;
  const { stationId } = scope;

  // The range length is the use case's to validate (7 | 30 | 90); a missing or
  // non-numeric value reaches it as NaN and is refused there.
  const days = Number(c.req.query('days'));
  const result = await new GetInsightsSales({
    reader: new DrizzleInsightsSalesReader(c.var.db),
  }).execute({ stationId, days }, buildContext(user, { stationId }));

  return sendResult(c, result);
});

/**
 * GET /api/reports/receivables?stationId=
 *
 * What customers owe, settled FIFO and aged from each debit's Business Date to
 * the Current Business Date: total, aging split and a row per customer that owes
 * (largest first, capped). ONE aggregate statement whatever the number of
 * customers or ledger entries (the station lookup for the clock is the only
 * other read). Open to the Roles that see the Money tab.
 *
 * A customer is an Organization-level party and so is its balance (the customers
 * list's `currentBalance`): the receivable covers the customer's whole ledger,
 * not one station's slice of it. The station gates access and supplies the
 * timezone and Day Start the age is measured with.
 */
reportsRouter.get('/receivables', async (c) => {
  const user = c.var.user;
  const scope = requireStationRead(
    c,
    canManageFinancialAccounts,
    'Insufficient permissions to view receivables',
  );
  if (scope instanceof Response) return scope;
  const { stationId } = scope;

  const clock = await loadStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);
  const result = await new GetReceivables(new DrizzleReceivablesReader(c.var.db)).execute(
    { stationId },
    buildContext(user, { stationId, ...clock }),
  );
  return sendResult(c, result);
});

/**
 * GET /api/reports/receivables/:customerId?stationId=
 *
 * One customer's receivable plus how they pay: last payment, usually-pays-in,
 * this month's credit vs paid and vehicle spend. One aggregate statement. A
 * customer outside the caller's Organization is a 404.
 */
reportsRouter.get('/receivables/:customerId', async (c) => {
  const user = c.var.user;
  const scope = requireStationRead(
    c,
    canManageFinancialAccounts,
    'Insufficient permissions to view receivables',
  );
  if (scope instanceof Response) return scope;
  const { stationId } = scope;

  const clock = await loadStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);
  const result = await new GetCustomerReceivable(new DrizzleReceivablesReader(c.var.db)).execute(
    { stationId, customerId: c.req.param('customerId') },
    buildContext(user, { stationId, ...clock }),
  );
  return sendResult(c, result);
});
