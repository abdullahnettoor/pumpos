import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import { canManageFinancialAccounts, canViewAttendantReport, canViewReports } from '@pump/shared';
import {
  ATTENDANT_REPORT_CAPABILITY,
  GetAttendantHandoverReport,
  GetCustomerReceivable,
  GetInsightsAttendantVariance,
  GetInsightsCreditHealth,
  GetInsightsSales,
  GetInsightsStockLoss,
  GetReceivables,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { requireCapabilityGuard } from '../infra/capability-guard.js';
import { DrizzleAttendantHandoverReportReader } from '../infra/repositories/attendant-report-repositories.js';
import {
  DrizzleInsightsAttendantVarianceReader,
  DrizzleInsightsCreditHealthReader,
  DrizzleInsightsStockLossReader,
} from '../infra/repositories/insights-blocks-repositories.js';
import { DrizzleInsightsSalesReader } from '../infra/repositories/insights-repositories.js';
import { DrizzleReceivablesReader } from '../infra/repositories/receivables-repositories.js';
import { isUuid } from '../infra/is-uuid.js';
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
 * Organization-wide: a customer is an Organization-level party and so is its
 * balance (the customers list's `currentBalance`), so the figures cover the
 * customer's whole ledger across stations, not one station's slice. The station
 * only gates access and supplies the timezone and Day Start the age is measured
 * with.
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
 * this month's credit vs paid and vehicle spend. One aggregate statement.
 * Organization-wide like the list. A customer outside the caller's Organization,
 * or an id that is not a uuid, is a 404.
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

  const customerId = c.req.param('customerId');
  if (!isUuid(customerId)) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } },
      404,
    );
  }

  const clock = await loadStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);
  const result = await new GetCustomerReceivable(new DrizzleReceivablesReader(c.var.db)).execute(
    { stationId, customerId },
    buildContext(user, { stationId, ...clock }),
  );
  return sendResult(c, result);
});

/**
 * GET /api/reports/insights/attendant-variance?stationId=&days=7|30|90
 *
 * Cash variance by Attendant (the attendant level of the two-level drawer
 * variance, ADR 0005) from the Drawers of closed Shift Summaries. Gated exactly
 * like `/attendant-handovers`: the Organization's `reports.attendant`
 * entitlement first (CAPABILITY_NOT_ENTITLED), then the attendant-report Role.
 */
reportsRouter.get(
  '/insights/attendant-variance',
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

    const days = Number(c.req.query('days'));
    const result = await new GetInsightsAttendantVariance({
      reader: new DrizzleInsightsAttendantVarianceReader(c.var.db),
    }).execute({ stationId, days }, buildContext(user, { stationId }));

    return sendResult(c, result);
  },
);

/**
 * GET /api/reports/insights/stock-loss?stationId=&days=7|30|90
 *
 * Tank Dip variance against book stock per tank over the range's closed days:
 * litres, share of litres sold, rupees at cost basis, within / outside tolerance.
 */
reportsRouter.get('/insights/stock-loss', async (c) => {
  const user = c.var.user;
  const scope = requireStationRead(c, canViewReports, 'Insufficient permissions to view Insights');
  if (scope instanceof Response) return scope;
  const { stationId } = scope;

  const days = Number(c.req.query('days'));
  const result = await new GetInsightsStockLoss({
    reader: new DrizzleInsightsStockLossReader(c.var.db),
  }).execute({ stationId, days }, buildContext(user, { stationId }));

  return sendResult(c, result);
});

/**
 * GET /api/reports/insights/credit-health?stationId=&days=7|30|90
 *
 * Credit Sales given (Business Date) vs Collections received (Entry Date) over
 * the range, the change in receivables and the credit share of sales.
 */
reportsRouter.get('/insights/credit-health', async (c) => {
  const user = c.var.user;
  const scope = requireStationRead(c, canViewReports, 'Insufficient permissions to view Insights');
  if (scope instanceof Response) return scope;
  const { stationId } = scope;

  const days = Number(c.req.query('days'));
  const result = await new GetInsightsCreditHealth({
    reader: new DrizzleInsightsCreditHealthReader(c.var.db),
  }).execute({ stationId, days }, buildContext(user, { stationId }));

  return sendResult(c, result);
});
