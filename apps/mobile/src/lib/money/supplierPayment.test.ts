import { describe, expect, it } from 'vitest';
import {
  applyPaymentToSuppliers,
  sameSupplierPaymentEntries,
  supplierPaymentAccess,
  supplierPaymentFailure,
  supplierPaymentFormSchema,
  supplierPaymentRequest,
  type SupplierPaymentForm,
} from './supplierPayment.js';
import { classifyBalance, previewBalance } from './officePayment.js';

const TODAY = '2026-10-10';
const schema = supplierPaymentFormSchema(TODAY);

const form = (over: Partial<SupplierPaymentForm> = {}): SupplierPaymentForm => ({
  amount: '25000',
  fundingAccountId: 'acc-bank',
  entryDate: TODAY,
  notes: '',
  ...over,
});

const issues = (over: Partial<SupplierPaymentForm>) => {
  const r = schema.safeParse(form(over));
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
};

describe('supplierPaymentAccess', () => {
  it.each(['Owner', 'Manager', 'Accountant'] as const)(
    '%s may record (canRecordPurchase)',
    (role) => {
      expect(supplierPaymentAccess({ role, accessMode: 'NORMAL' })).toEqual({ status: 'enabled' });
    },
  );

  it.each(['Staff', 'Attendant'] as const)(
    'hides the action from %s (the server refuses them)',
    (role) => {
      expect(supplierPaymentAccess({ role, accessMode: 'NORMAL' })).toEqual({ status: 'hidden' });
    },
  );

  it('stays enabled under Restricted Access: the route is declared FINISH_OPEN_WORK', () => {
    expect(supplierPaymentAccess({ role: 'Owner', accessMode: 'RESTRICTED' })).toEqual({
      status: 'enabled',
    });
  });

  it('is disabled with a reason while suspended, and not refused while the Access Document is unknown', () => {
    const a = supplierPaymentAccess({ role: 'Owner', accessMode: 'SUSPENDED' });
    expect(a.status === 'disabled' && a.reason).toMatch(/suspended/i);
    expect(supplierPaymentAccess({ role: 'Owner' })).toEqual({ status: 'enabled' });
  });
});

describe('supplierPaymentFormSchema', () => {
  it('accepts a valid payment', () => {
    expect(schema.safeParse(form()).success).toBe(true);
  });

  it('needs an amount above zero, to 2 decimals, within the column', () => {
    expect(issues({ amount: '' }).amount).toBe('Amount is required');
    expect(issues({ amount: '0' }).amount).toBe('Amount must be positive');
    expect(issues({ amount: '10.123' }).amount).toBe('Use at most 2 decimal places.');
    expect(issues({ amount: '10000000000' }).amount).toBe('That is more than a payment can hold.');
    expect(schema.safeParse(form({ amount: '9999999999.99' })).success).toBe(true);
  });

  it('needs the account it is paid from', () => {
    expect(issues({ fundingAccountId: '' }).fundingAccountId).toBe('Choose the account');
  });

  it('needs a real calendar date that is not in the future', () => {
    expect(issues({ entryDate: '' }).entryDate).toBeTruthy();
    expect(issues({ entryDate: '2026-02-30' }).entryDate).toBe('Choose a real date.');
    expect(issues({ entryDate: '2026-10-11' }).entryDate).toBe('The date cannot be in the future.');
    expect(schema.safeParse(form({ entryDate: '2026-09-30' })).success).toBe(true);
  });

  it('keeps the reference to 500 characters', () => {
    expect(issues({ notes: 'x'.repeat(501) }).notes).toBeTruthy();
    expect(schema.safeParse(form({ notes: 'x'.repeat(500) })).success).toBe(true);
  });
});

describe('supplierPaymentRequest', () => {
  it('is an Office Record: station + entry date + funding account, no shift', () => {
    const body = supplierPaymentRequest('st-1', 'su-1', form({ notes: '  NEFT 4471 ' }));
    expect(body).toEqual({
      stationId: 'st-1',
      entryDate: TODAY,
      fundingAccountId: 'acc-bank',
      supplierId: 'su-1',
      amount: 25000,
      notes: 'NEFT 4471',
    });
    expect(body).not.toHaveProperty('shiftId');
    expect(body).not.toHaveProperty('paymentMethod');
  });

  it('leaves the reference out when blank', () => {
    expect(supplierPaymentRequest('st-1', 'su-1', form({ notes: '  ' })).notes).toBeUndefined();
  });
});

describe('the payable after a payment', () => {
  it('still owed, settled, or paid ahead (a negative balance is an advance)', () => {
    expect(previewBalance(1043200, '43200')).toEqual({ kind: 'owes', amount: 1000000 });
    expect(previewBalance(1043200, '1043200')).toEqual({ kind: 'settled', amount: 0 });
    expect(previewBalance(1000, '1500')).toEqual({ kind: 'advance', amount: 500 });
    // Already ahead: another payment is more ahead.
    expect(previewBalance(-500, '250')).toEqual({ kind: 'advance', amount: 750 });
    expect(classifyBalance(-49000)).toEqual({ kind: 'advance', amount: 49000 });
  });

  it('has nothing to preview for a blank or invalid amount', () => {
    for (const text of ['', '  ', 'abc', '0', '-5']) expect(previewBalance(100, text)).toBeNull();
  });

  it('writes the payment into cached suppliers lists, keeping each balance in its own type', () => {
    const list = [
      { id: 's1', currentBalance: '1043200.00' },
      { id: 's2', currentBalance: 300 },
    ];
    expect(applyPaymentToSuppliers(list, 's1', 43200)).toEqual([
      { id: 's1', currentBalance: '1000000.00' },
      { id: 's2', currentBalance: 300 },
    ]);
    expect(applyPaymentToSuppliers([{ id: 's2', currentBalance: 300 }], 's2', 400)).toEqual([
      { id: 's2', currentBalance: -100 },
    ]);
    expect(applyPaymentToSuppliers(undefined, 's1', 1)).toBeUndefined();
  });
});

describe('sameSupplierPaymentEntries', () => {
  it('compares entries as the server reads them (trimmed)', () => {
    const a = form({ amount: '25000', notes: 'ref' });
    expect(sameSupplierPaymentEntries(a, form({ amount: ' 25000 ', notes: ' ref ' }))).toBe(true);
    expect(sameSupplierPaymentEntries(a, form({ amount: '24000', notes: 'ref' }))).toBe(false);
    expect(
      sameSupplierPaymentEntries(a, form({ amount: '25000', notes: 'ref', fundingAccountId: 'x' })),
    ).toBe(false);
  });
});

describe('supplierPaymentFailure', () => {
  const e = (code: string, message = 'server says no', status = 400) =>
    Object.assign(new Error(message), { code, status });

  it('shows the access refusals with the server wording', () => {
    expect(
      supplierPaymentFailure(e('ORGANIZATION_SUSPENDED', 'Suspended. Contact PumpOS.')).message,
    ).toBe('Suspended. Contact PumpOS.');
    expect(supplierPaymentFailure(e('SUBSCRIPTION_RESTRICTED', 'Restricted.')).message).toBe(
      'Restricted.',
    );
  });

  it('names the other refusals in supplier terms', () => {
    expect(supplierPaymentFailure(e('FORBIDDEN')).message).toMatch(/supplier payments/i);
    expect(supplierPaymentFailure(e('NOT_FOUND')).message).toMatch(/supplier or account/i);
  });

  it('keeps the server message for a validation refusal (account type, future date)', () => {
    expect(
      supplierPaymentFailure(e('VALIDATION_ERROR', 'Account "Merchant" cannot pay suppliers'))
        .message,
    ).toBe('Account "Merchant" cannot pay suppliers');
  });

  it('falls back to a retry hint', () => {
    expect(supplierPaymentFailure(new Error('')).message).toMatch(/try again/i);
  });
});
