import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import { canViewAttendantReport, isAuthorizedForStation } from '@pump/shared';
import { ATTENDANT_REPORT_CAPABILITY, GetAttendantHandoverReport } from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { requireCapabilityGuard } from '../infra/capability-guard.js';
import { DrizzleAttendantHandoverReportReader } from '../infra/repositories/attendant-report-repositories.js';
import { sendResult } from '../infra/send-result.js';

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
    if (!canViewAttendantReport(user.role)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions to view the Attendant Handover Report',
          },
        },
        403,
      );
    }

    const stationId = c.req.query('stationId');
    const from = c.req.query('from');
    const to = c.req.query('to');
    const attendantId = c.req.query('attendantId') || undefined;
    if (!stationId || !from || !to) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Missing stationId, from, or to' },
        },
        400,
      );
    }
    if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }

    const result = await new GetAttendantHandoverReport({
      reader: new DrizzleAttendantHandoverReportReader(c.var.db),
    }).execute({ stationId, from, to, attendantId }, buildContext(user, { stationId }));

    return sendResult(c, result);
  },
);
