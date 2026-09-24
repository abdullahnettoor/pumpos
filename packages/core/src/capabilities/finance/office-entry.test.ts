import { describe, expect, it } from 'vitest';
import { resolveOfficeEntry } from './office-entry.js';
import {
  AccountRepo,
  account,
  officeCtx,
  terminal,
  TerminalLookup,
} from './__fixtures__/office.js';
import { accountTypesForPaymentMethod } from './office-entry.js';

const accounts = new AccountRepo();

describe('resolveOfficeEntry — Entry Date (ADR 0005)', () => {
  it('defaults to today in the station timezone', async () => {
    const r = await resolveOfficeEntry({ accounts }, officeCtx(), { fundingAccountId: 'cash' });
    expect(r.success && r.data.entryDate).toBe('2026-03-15');
  });

  it('dates a 03:00 entry on the 15th the 15th even when Day Start is 06:00', async () => {
    // 21:30 UTC on the 14th = 03:00 IST on the 15th.
    const r = await resolveOfficeEntry({ accounts }, officeCtx('2026-03-14T21:30:00Z'), {
      fundingAccountId: 'cash',
    });
    expect(r.success && r.data.entryDate).toBe('2026-03-15');
  });

  it('accepts any past date', async () => {
    const r = await resolveOfficeEntry({ accounts }, officeCtx(), {
      fundingAccountId: 'cash',
      entryDate: '2025-01-01',
    });
    expect(r.success && r.data.entryDate).toBe('2025-01-01');
  });

  it('rejects a future date', async () => {
    const r = await resolveOfficeEntry({ accounts }, officeCtx(), {
      fundingAccountId: 'cash',
      entryDate: '2026-03-16',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.message).toMatch(/future/);
  });

  it('rejects an impossible date', async () => {
    const r = await resolveOfficeEntry({ accounts }, officeCtx(), {
      fundingAccountId: 'cash',
      entryDate: '2026-02-30',
    });
    expect(r.success).toBe(false);
  });

  it('requires a station', async () => {
    const ctx = { ...officeCtx(), stationId: null };
    const r = await resolveOfficeEntry({ accounts }, ctx, { fundingAccountId: 'cash' });
    expect(r.success).toBe(false);
  });
});

describe('resolveOfficeEntry — Funding Account', () => {
  it('requires one', async () => {
    const r = await resolveOfficeEntry({ accounts }, officeCtx(), {});
    expect(r.success).toBe(false);
  });

  it('refuses another organization or station, and inactive accounts', async () => {
    const repo = new AccountRepo([
      account('foreign', 'BANK', { organizationId: 'org-2' }),
      account('elsewhere', 'BANK', { stationId: 'st-2' }),
      account('closed', 'BANK', { isActive: false }),
      account('shared', 'OWNER', { stationId: null }),
    ]);
    for (const id of ['foreign', 'elsewhere', 'closed']) {
      const r = await resolveOfficeEntry({ accounts: repo }, officeCtx(), { fundingAccountId: id });
      expect(r.success, id).toBe(false);
    }
    const shared = await resolveOfficeEntry({ accounts: repo }, officeCtx(), {
      fundingAccountId: 'shared',
    });
    expect(shared.success).toBe(true);
  });

  it('filters by payment method', async () => {
    const cashIntoBank = await resolveOfficeEntry(
      { accounts },
      officeCtx(),
      { fundingAccountId: 'hdfc' },
      { allowedAccountTypes: accountTypesForPaymentMethod('Cash') },
    );
    expect(cashIntoBank.success).toBe(false);
    const cashIntoPetty = await resolveOfficeEntry(
      { accounts },
      officeCtx(),
      { fundingAccountId: 'petty' },
      { allowedAccountTypes: accountTypesForPaymentMethod('Cash') },
    );
    expect(cashIntoPetty.success).toBe(true);
  });
});

describe('resolveOfficeEntry — Payment Terminal (#276)', () => {
  const linked = terminal('pos-1', { clearingAccountId: 'paytm' });
  const unlinked = terminal('pos-2');
  const cardOnly = terminal('pos-3', { supportsUpi: false });
  const elsewhere = terminal('pos-4', { stationId: 'st-2' });
  const foreign = terminal('pos-5', { organizationId: 'org-2' });
  const repo = new AccountRepo([
    ...new AccountRepo().rows,
    account('paytm', 'MERCHANT_CLEARING', { name: 'Paytm Clearing' }),
  ]);
  const terminals = new TerminalLookup([linked, unlinked, cardOnly, elsewhere, foreign]);
  const deps = { accounts: repo, terminals };

  it("posts to the terminal's clearing account", async () => {
    const r = await resolveOfficeEntry(
      deps,
      officeCtx(),
      { terminalId: 'pos-1' },
      { paymentMethod: 'UPI' },
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fundingAccount.id).toBe('paytm');
      expect(r.data.terminalId).toBe('pos-1');
    }
  });

  it('falls back to the generic Merchant Clearing when the terminal has none', async () => {
    const r = await resolveOfficeEntry(
      deps,
      officeCtx(),
      { terminalId: 'pos-2', fundingAccountId: 'hdfc' },
      { paymentMethod: 'Card' },
    );
    expect(r.success && r.data.fundingAccount.id).toBe('clearing');
  });

  it('rejects a cross-tenant or wrong-station terminal', async () => {
    for (const id of ['pos-4', 'pos-5']) {
      const r = await resolveOfficeEntry(
        deps,
        officeCtx(),
        { terminalId: id },
        { paymentMethod: 'Card' },
      );
      expect(r.success, id).toBe(false);
      if (!r.success) expect(r.error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects a terminal that does not support the method, or a non-card method', async () => {
    const upi = await resolveOfficeEntry(
      deps,
      officeCtx(),
      { terminalId: 'pos-3' },
      { paymentMethod: 'UPI' },
    );
    expect(upi.success).toBe(false);
    const cash = await resolveOfficeEntry(
      deps,
      officeCtx(),
      { terminalId: 'pos-1' },
      { paymentMethod: 'Cash' },
    );
    expect(cash.success).toBe(false);
  });

  it('refuses a terminal on a record that cannot take one', async () => {
    const r = await resolveOfficeEntry({ accounts: repo }, officeCtx(), {
      terminalId: 'pos-1',
      fundingAccountId: 'cash',
    });
    expect(r.success).toBe(false);
  });
});
