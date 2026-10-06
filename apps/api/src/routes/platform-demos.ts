import { Hono, type Context } from 'hono';
import type { DbClient } from '@pump/db';
import type { Result } from '@pump/core';
import { DEMO_EXPIRY_DAYS } from '@pump/shared';
import { z } from 'zod';
import { SupabaseAdmin } from '../infra/supabase-admin.js';
import {
  createDemo,
  deleteDemo,
  expireDemoOrganizations,
  extendDemo,
  resetDemo,
  type DemoAuthAdmin,
} from '../services/demo/demo-lifecycle.js';

export { expireDemoOrganizations };

type DemoBindings = {
  ALLOW_DEMO_ORGS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  INVITE_REDIRECT_URL?: string;
};
type DemoVariables = {
  db: DbClient;
  platformAdmin: { email: string; subjectId: string | null };
  /** Test seam: replaces the Supabase admin client. */
  demoAuthAdmin?: DemoAuthAdmin;
};
type DemoEnv = { Bindings: DemoBindings; Variables: DemoVariables };

const expiryDays = z
  .number()
  .int()
  .refine((days) => (DEMO_EXPIRY_DAYS as readonly number[]).includes(days), {
    message: `Expiry must be one of ${DEMO_EXPIRY_DAYS.join(', ')} days`,
  });

const createDemoSchema = z.object({
  stationName: z.string().trim().min(2).max(255),
  town: z.string().trim().min(2).max(255),
  tanks: z.number().int().min(1).max(20).default(2),
  nozzles: z.number().int().min(1).max(60).default(6),
  attendants: z.number().int().min(1).max(50).default(3),
  prospectEmail: z.string().trim().email().optional(),
  expiresInDays: expiryDays.default(2),
});
const extendDemoSchema = z.object({ expiresInDays: expiryDays });

const STATUS_BY_CODE: Record<string, 400 | 404 | 409 | 500> = {
  VALIDATION_ERROR: 400,
  DEMO_INVITE_FAILED: 400,
  DEMO_CREATE_FAILED: 500,
  OWNER_ALREADY_EXISTS: 409,
  OWNER_NOT_FOUND: 409,
  NOT_A_DEMO_ORGANIZATION: 409,
};

function send<T>(c: Context<DemoEnv>, result: Result<T>, successStatus: 200 | 201 = 200) {
  if (result.success) return c.json({ success: true, data: result.data }, successStatus);
  const { code, message } = result.error;
  // Only codes raised by the demo service carry operator-safe messages.
  const status = STATUS_BY_CODE[code];
  if (!status) {
    console.error('[platform-demo] unexpected failure', { code, message });
    return c.json(
      {
        success: false,
        error: { code: 'DEMO_OPERATION_FAILED', message: 'The demo operation failed.' },
      },
      500,
    );
  }
  return c.json({ success: false, error: { code, message } }, status);
}

/** Run a service call; unexpected throws are logged and answered generically. */
async function run<T>(
  c: Context<DemoEnv>,
  action: string,
  work: () => Promise<Result<T>>,
  successStatus: 200 | 201 = 200,
) {
  try {
    return send(c, await work(), successStatus);
  } catch (error) {
    console.error(`[platform-demo] ${action} failed`, {
      organizationId: c.req.param('orgId'),
      detail: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        success: false,
        error: { code: 'DEMO_OPERATION_FAILED', message: 'The demo operation failed.' },
      },
      500,
    );
  }
}

function adminFor(c: Context<DemoEnv>): DemoAuthAdmin | null {
  if (c.var.demoAuthAdmin) return c.var.demoAuthAdmin;
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SECRET_KEY) return null;
  return new SupabaseAdmin({ url: c.env.SUPABASE_URL, secretKey: c.env.SUPABASE_SECRET_KEY });
}

async function body(c: Context<DemoEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function invalid(c: Context<DemoEnv>, message: string) {
  return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message } }, 400);
}

/**
 * Platform-admin demo organisation routes (#368). Mounted under the
 * `/platform` router, which already enforces the platform-admin check; these
 * are not tenant routes, so they carry no Restricted Access write policy.
 */
export const platformDemosRouter = new Hono<DemoEnv>();

platformDemosRouter.use('*', async (c, next) => {
  if (c.env.ALLOW_DEMO_ORGS !== 'true') {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Demo organizations are disabled for this target' },
      },
      403,
    );
  }
  await next();
});

platformDemosRouter.post('/', async (c) => {
  const parsed = createDemoSchema.safeParse(await body(c));
  if (!parsed.success) return invalid(c, 'Demo station details are invalid.');
  const admin = adminFor(c);
  if (!admin)
    return c.json(
      {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Auth provisioning is not configured' },
      },
      500,
    );
  return run(
    c,
    'create',
    () =>
      createDemo(c.var.db, admin, parsed.data, c.var.platformAdmin, {
        inviteRedirectUrl: c.env.INVITE_REDIRECT_URL,
      }),
    201,
  );
});

platformDemosRouter.post('/:orgId/reset', (c) =>
  run(c, 'reset', () => resetDemo(c.var.db, c.req.param('orgId'), c.var.platformAdmin)),
);

platformDemosRouter.post('/:orgId/extend', async (c) => {
  const parsed = extendDemoSchema.safeParse(await body(c));
  if (!parsed.success)
    return invalid(c, `Expiry must be one of ${DEMO_EXPIRY_DAYS.join(', ')} days`);
  return run(c, 'extend', () =>
    extendDemo(c.var.db, c.req.param('orgId'), parsed.data.expiresInDays, c.var.platformAdmin),
  );
});

platformDemosRouter.delete('/:orgId', (c) =>
  run(c, 'delete', () =>
    deleteDemo(c.var.db, adminFor(c), c.req.param('orgId'), c.var.platformAdmin),
  ),
);
