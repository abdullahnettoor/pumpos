import { Hono } from 'hono';
import { type DbClient } from '@pump/db';
import { canManageFinancialAccounts, isAuthorizedForStation, type Role } from '@pump/shared';
import { CreateFinancialAccount, UpdateFinancialAccount, RecordTransfer, type Result } from '@pump/core';
import { buildContext } from '../infra/context.js';
import { loadStationClock } from '../infra/station-clock.js';
import { runInTransaction } from '../infra/transaction.js';
import {
  DrizzleFinancialAccountRepository,
  DrizzleLedgerEntryRepository,
  DrizzleFinancialAccountReader,
} from '../infra/repositories/finance-account-repositories.js';

type Variables = {
  db: DbClient;
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: Role;
    assignedStationIds: string[];
  };
};

export const financeRouter = new Hono<{ Variables: Variables }>();

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  INVARIANT_VIOLATION: 409,
};

function sendResult<T>(c: any, result: Result<T>) {
  if (result.success) return c.json({ success: true, data: result.data });
  const status = STATUS_BY_CODE[result.error.code] ?? 400;
  return c.json({ success: false, error: result.error }, status);
}

const forbidden = (c: any) => c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not permitted' } }, 403);

// GET /finance/accounts?stationId= — list money accounts with current balances.
financeRouter.get('/accounts', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const stationId = c.req.query('stationId') || undefined;
  const accounts = await new DrizzleFinancialAccountReader(db).listWithBalances(user.organizationId, stationId);
  return c.json({ success: true, data: accounts });
});

// GET /finance/accounts/:id/ledger?from=&to= — per-account statement.
financeRouter.get('/accounts/:id/ledger', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const from = c.req.query('from') || undefined;
  const to = c.req.query('to') || undefined;
  const data = await new DrizzleFinancialAccountReader(db).accountLedger(user.organizationId, c.req.param('id'), from, to);
  if (!data) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404);
  return c.json({ success: true, data });
});

// POST /finance/accounts — create a money account (seeds an OPENING entry).
financeRouter.post('/accounts', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const body = await c.req.json().catch(() => ({}));
  const stationId: string | null = body?.stationId ?? null;
  if (stationId && !isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const clock = stationId ? await loadStationClock(db, stationId) : {};
  const result = await runInTransaction(db, (tx, events) =>
    new CreateFinancialAccount({
      accounts: new DrizzleFinancialAccountRepository(tx),
      ledger: new DrizzleLedgerEntryRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: stationId ?? undefined, ...clock })),
  );
  return sendResult(c, result);
});

// PUT /finance/accounts/:id — edit name / metadata / active flag.
financeRouter.put('/accounts/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(db, (tx, events) =>
    new UpdateFinancialAccount({
      accounts: new DrizzleFinancialAccountRepository(tx),
      ledger: new DrizzleLedgerEntryRepository(tx),
      events,
    }).execute({ ...body, id: c.req.param('id') }, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /finance/transfers — move money between accounts (deposit / float / bank↔bank).
financeRouter.post('/transfers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(db, (tx, events) =>
    new RecordTransfer({
      accounts: new DrizzleFinancialAccountRepository(tx),
      ledger: new DrizzleLedgerEntryRepository(tx),
      events,
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});
