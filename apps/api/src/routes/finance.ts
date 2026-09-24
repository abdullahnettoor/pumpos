import { Hono } from 'hono';
import { type DbClient } from '@pump/db';
import {
  canCreateExpense,
  canManageFinancialAccounts,
  isAuthorizedForStation,
  isValidBusinessDate,
} from '@pump/shared';
import {
  CreateFinancialAccount,
  UpdateFinancialAccount,
  SetOpeningBalance,
  RecordTransfer,
  RecordSettlement,
  RecordLedgerAdjustment,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { loadStationClock, stationNotFound } from '../infra/station-clock.js';
import { runInTransaction } from '../infra/transaction.js';
import { sendResult } from '../infra/send-result.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';
import {
  DrizzleFinancialAccountRepository,
  DrizzleLedgerEntryRepository,
  DrizzleFinancialAccountReader,
} from '../infra/repositories/finance-account-repositories.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const financeRouter = new Hono<{ Variables: Variables }>();

const forbidden = (c: any) =>
  c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not permitted' } }, 403);

// GET /finance/accounts?stationId= — list money accounts with current balances.
financeRouter.get('/accounts', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const stationId = c.req.query('stationId') || undefined;
  const accounts = await new DrizzleFinancialAccountReader(db).listWithBalances(
    user.organizationId,
    stationId,
  );
  return c.json({ success: true, data: accounts });
});

// GET /finance/accounts/:id/ledger?from=&to= — per-account statement.
financeRouter.get('/accounts/:id/ledger', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const from = c.req.query('from') || undefined;
  const to = c.req.query('to') || undefined;
  const data = await new DrizzleFinancialAccountReader(db).accountLedger(
    user.organizationId,
    c.req.param('id'),
    from,
    to,
  );
  if (!data)
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } },
      404,
    );
  return c.json({ success: true, data });
});

// GET /finance/movements?stationId=&from=&to= — station-wide ledger movements
// (backs the repriced Cash & Bank report).
financeRouter.get('/movements', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const stationId = c.req.query('stationId');
  if (!stationId)
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  const from = c.req.query('from') || undefined;
  const to = c.req.query('to') || undefined;
  const data = await new DrizzleFinancialAccountReader(db).stationMovements(
    user.organizationId,
    stationId,
    from,
    to,
  );
  return c.json({ success: true, data });
});

// GET /finance/funding-accounts?stationId= — active accounts an Office Record
// may name as its Funding Account (ADR 0005). Open to every office role, since
// Staff record expenses and collections too.
financeRouter.get('/funding-accounts', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canCreateExpense(user.role)) return forbidden(c);
  const stationId = c.req.query('stationId');
  if (!stationId)
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId }))
    return forbidden(c);
  const data = await new DrizzleFinancialAccountReader(db).listFundingAccounts(
    user.organizationId,
    stationId,
  );
  return c.json({ success: true, data });
});

// GET /finance/cash-book?stationId=&date= — the live Daily Cash Book: each
// account's opening, in, out and closing on one Entry Date (ADR 0005).
financeRouter.get('/cash-book', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const stationId = c.req.query('stationId');
  const date = c.req.query('date');
  if (!stationId || !date || !isValidBusinessDate(date))
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'stationId and date (YYYY-MM-DD) are required',
        },
      },
      400,
    );
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId }))
    return forbidden(c);
  const data = await new DrizzleFinancialAccountReader(db).dailyCashBook(
    user.organizationId,
    stationId,
    date,
  );
  return c.json({ success: true, data });
});

// POST /finance/accounts — create a money account (seeds an OPENING entry).
financeRouter.post('/accounts', writePolicyGuard('POST /finance/accounts'), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const body = await c.req.json().catch(() => ({}));
  const stationId: string | null = body?.stationId ?? null;
  if (
    stationId &&
    !isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })
  ) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  const clock = await loadStationClock(db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);
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
financeRouter.put('/accounts/:id', writePolicyGuard('PUT /finance/accounts/:id'), async (c) => {
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

// PUT /finance/accounts/:id/opening — set/correct the opening balance at any time.
financeRouter.put(
  '/accounts/:id/opening',
  writePolicyGuard('PUT /finance/accounts/:id/opening'),
  async (c) => {
    const db = c.var.db;
    const user = c.var.user;
    if (!canManageFinancialAccounts(user.role)) return forbidden(c);
    const body = await c.req.json().catch(() => ({}));
    const result = await runInTransaction(db, (tx, events) =>
      new SetOpeningBalance({
        accounts: new DrizzleFinancialAccountRepository(tx),
        ledger: new DrizzleLedgerEntryRepository(tx),
        events,
      }).execute({ ...body, id: c.req.param('id') }, buildContext(user)),
    );
    return sendResult(c, result);
  },
);

// POST /finance/transfers — move money between accounts (deposit / float / bank↔bank).
financeRouter.post('/transfers', writePolicyGuard('POST /finance/transfers'), async (c) => {
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

// POST /finance/settlements — settle a card/UPI clearing batch to bank, net of MDR.
financeRouter.post('/settlements', writePolicyGuard('POST /finance/settlements'), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageFinancialAccounts(user.role)) return forbidden(c);
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(db, (tx, events) =>
    new RecordSettlement({
      accounts: new DrizzleFinancialAccountRepository(tx),
      ledger: new DrizzleLedgerEntryRepository(tx),
      events,
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /finance/accounts/:id/entry — manual entry (bank charge / interest / adjustment).
financeRouter.post(
  '/accounts/:id/entry',
  writePolicyGuard('POST /finance/accounts/:id/entry'),
  async (c) => {
    const db = c.var.db;
    const user = c.var.user;
    if (!canManageFinancialAccounts(user.role)) return forbidden(c);
    const body = await c.req.json().catch(() => ({}));
    const result = await runInTransaction(db, (tx, events) =>
      new RecordLedgerAdjustment({
        accounts: new DrizzleFinancialAccountRepository(tx),
        ledger: new DrizzleLedgerEntryRepository(tx),
        events,
      }).execute({ ...body, accountId: c.req.param('id') }, buildContext(user)),
    );
    return sendResult(c, result);
  },
);
