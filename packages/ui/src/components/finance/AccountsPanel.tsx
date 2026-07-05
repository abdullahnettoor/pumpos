import React, { useMemo, useState } from 'react';
import { PageLayout } from '../primitives/PageLayout.js';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { KpiCard } from '../primitives/KpiCard.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { LedgerView } from '../ledger/LedgerView.js';
import { DateRangeField, computeRange, type DateRange } from '../primitives/DateRangeField.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useFinancialAccounts, useAccountLedger, queryKeys } from '../../query/hooks.js';
import { CloudFinanceService } from '../../services/cloud.js';
import { inr } from '../../utils/format.js';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet, ArrowLeft, ArrowLeftRight } from 'lucide-react';

const financeSvc = new CloudFinanceService();

type AccountType = 'CASH_IN_HAND' | 'PETTY_CASH' | 'BANK' | 'MERCHANT_CLEARING' | 'OWNER';

const TYPE_LABEL: Record<AccountType, string> = {
  CASH_IN_HAND: 'Cash in Hand',
  PETTY_CASH: 'Petty Cash',
  BANK: 'Bank',
  MERCHANT_CLEARING: 'Card/UPI Clearing',
  OWNER: 'Owner',
};

const SOURCE_LABEL: Record<string, string> = {
  OPENING: 'Opening balance',
  SALE_CASH: 'Cash sale',
  SALE_CARD: 'Card/UPI sale',
  COLLECTION: 'Collection',
  EXPENSE: 'Expense',
  SUPPLIER_PAYMENT: 'Supplier payment',
  DEPOSIT: 'Cash deposit',
  TRANSFER: 'Transfer',
  SETTLEMENT: 'Settlement',
  BANK_CHARGE: 'Bank charge',
  ADJUSTMENT: 'Adjustment',
};

export interface AccountsPanelProps {
  selectedStation: any | null;
}

/**
 * Money accounts (Phase F). Lists each account with its live balance and, on
 * selection, shows a per-account ledger/statement. New accounts can be created
 * (bank, petty cash, owner, clearing); system accounts also appear automatically
 * once money is posted to them.
 */
export const AccountsPanel: React.FC<AccountsPanelProps> = ({ selectedStation }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const stationId = selectedStation?.id ?? null;
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };

  const { data: accounts, isLoading } = useFinancialAccounts(stationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  // Create drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>('BANK');
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transfer drawer state
  const [transferOpen, setTransferOpen] = useState(false);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const selected = useMemo(() => (accounts || []).find((a: any) => a.id === selectedId) || null, [accounts, selectedId]);
  const { data: ledger, isLoading: ledgerLoading } = useAccountLedger(selectedId, { from: range.from, to: range.to });

  const openCreate = () => {
    setAccountType('BANK');
    setName('');
    setOpeningBalance('');
    setOpeningDate('');
    setBankName('');
    setAccountNo('');
    setIfsc('');
    setError(null);
    setDrawerOpen(true);
  };

  const openTransfer = () => {
    const list = accounts || [];
    setFromAccountId(list[0]?.id ?? '');
    setToAccountId(list[1]?.id ?? '');
    setTransferAmount('');
    setTransferDate('');
    setTransferNotes('');
    setTransferError(null);
    setTransferOpen(true);
  };

  const submitTransfer = async () => {
    if (!fromAccountId || !toAccountId) {
      setTransferError('Choose both accounts.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setTransferError('From and To must be different accounts.');
      return;
    }
    if (!(Number(transferAmount) > 0)) {
      setTransferError('Enter an amount greater than zero.');
      return;
    }
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      await financeSvc.recordTransfer({
        fromAccountId,
        toAccountId,
        amount: Number(transferAmount),
        date: transferDate || null,
        notes: transferNotes || null,
      });
      setTransferOpen(false);
      await qc.invalidateQueries({ queryKey: queryKeys.financialAccounts(stationId ?? '') });
      await qc.invalidateQueries({ queryKey: ['account-ledger'] });
      toast.success('Transfer recorded.');
    } catch (err: any) {
      setTransferError(err.message || 'Failed to record transfer.');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setError('Give the account a name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const metadata: Record<string, unknown> = {};
      if (accountType === 'BANK') {
        if (bankName.trim()) metadata.bankName = bankName.trim();
        if (accountNo.trim()) metadata.accountNoMasked = accountNo.trim();
        if (ifsc.trim()) metadata.ifsc = ifsc.trim();
      }
      await financeSvc.createAccount({
        stationId,
        accountType,
        name: name.trim(),
        openingBalance: Number(openingBalance) || 0,
        openingDate: openingDate || null,
        metadata: Object.keys(metadata).length ? metadata : null,
      });
      setDrawerOpen(false);
      await qc.invalidateQueries({ queryKey: queryKeys.financialAccounts(stationId ?? '') });
      toast.success('Account created.');
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Per-account ledger view ----
  if (selected) {
    const totals = { moneyIn: 0, moneyOut: 0 };
    for (const e of ledger?.entries || []) {
      if (e.direction === 'in') totals.moneyIn += Number(e.amount || 0);
      else totals.moneyOut += Number(e.amount || 0);
    }
    const opening = Number(ledger?.periodOpeningBalance || 0);
    const closing = opening + totals.moneyIn - totals.moneyOut;

    return (
      <PageLayout
        title={selected.name}
        subtitle={`${TYPE_LABEL[selected.accountType as AccountType] ?? selected.accountType} · statement`}
        actions={
          <button className="btn btn-secondary btn-md" onClick={() => setSelectedId(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={14} /> All accounts
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <DateRangeField value={range} onChange={setRange} clock={clock} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <KpiCard label="Opening" value={inr(opening)} />
            <KpiCard label="Money In" value={inr(totals.moneyIn)} tone="success" />
            <KpiCard label="Money Out" value={inr(totals.moneyOut)} tone="danger" />
            <KpiCard label="Closing" value={inr(closing)} tone={closing < 0 ? 'danger' : 'default'} />
          </div>
          <LedgerView
            entries={ledger?.entries || []}
            openingBalance={opening}
            loading={ledgerLoading}
            debitLabel="In"
            creditLabel="Out"
            balanceLabel="Balance"
            emptyText="No movements in this period."
            resolve={(e: any) => ({
              id: e.id,
              date: e.entryDate,
              dateLabel: e.entryDate,
              type: SOURCE_LABEL[e.sourceType] ?? e.sourceType,
              notes: e.notes ?? undefined,
              amount: Number(e.amount || 0),
              direction: e.direction === 'in' ? 'debit' : 'credit',
            })}
          />
        </div>
      </PageLayout>
    );
  }

  // ---- Accounts list ----
  return (
    <PageLayout
      title="Accounts"
      subtitle="Cash, bank, petty cash and card/UPI clearing balances."
      actions={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-md" onClick={openTransfer} disabled={(accounts || []).length < 2} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeftRight size={14} /> Transfer
          </button>
          <button className="btn btn-primary btn-md" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> New Account
          </button>
        </div>
      }
    >
      {isLoading ? (
        <LoadingSpinner />
      ) : (accounts || []).length === 0 ? (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Wallet size={28} style={{ color: 'var(--text-faint)', marginBottom: '8px' }} />
          <p style={{ margin: 0 }}>No accounts yet. Create a bank/petty-cash/owner account, or record a collection or expense — system accounts (Cash in Hand, Bank) appear automatically.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
                {['Account', 'Type', 'Balance'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(accounts || []).map((a: any) => (
                <tr key={a.id} onClick={() => { setSelectedId(a.id); setRange(computeRange('this-month', clock)); }} style={{ borderTop: '1px solid var(--border-soft)', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text-strong)', fontWeight: 500 }}>
                    {a.name}
                    {a.isActive === false && <span style={{ marginLeft: 8, fontSize: '11px', color: 'var(--text-faint)' }}>(inactive)</span>}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{TYPE_LABEL[a.accountType as AccountType] ?? a.accountType}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: Number(a.balance) < 0 ? 'var(--brand-danger)' : 'var(--text-strong)' }}>{inr(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="New Account">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>{error}</div>
          )}
          <Field label="Type">
            <Select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} disabled={submitting}>
              <option value="BANK">Bank</option>
              <option value="PETTY_CASH">Petty Cash</option>
              <option value="CASH_IN_HAND">Cash in Hand</option>
              <option value="MERCHANT_CLEARING">Card/UPI Clearing</option>
              <option value="OWNER">Owner</option>
            </Select>
          </Field>
          <Field label="Name">
            <TextInput placeholder={TYPE_LABEL[accountType]} value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
          </Field>
          {accountType === 'BANK' && (
            <>
              <Field label="Bank Name">
                <TextInput placeholder="e.g. HDFC Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={submitting} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Account No.">
                  <TextInput placeholder="****1234" value={accountNo} onChange={(e) => setAccountNo(e.target.value)} disabled={submitting} />
                </Field>
                <Field label="IFSC">
                  <TextInput placeholder="HDFC0000123" value={ifsc} onChange={(e) => setIfsc(e.target.value)} disabled={submitting} />
                </Field>
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Opening Balance (₹)">
              <NumberInput placeholder="0" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} disabled={submitting} />
            </Field>
            <Field label="As of">
              <DateField value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} disabled={submitting} />
            </Field>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
            The opening balance seeds the ledger and is fixed once set — correct it later with an adjustment.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={submitting} onClick={submit}>{submitting ? 'Creating…' : 'Create Account'}</button>
            <button className="btn btn-secondary btn-md" disabled={submitting} onClick={() => setDrawerOpen(false)}>Cancel</button>
          </div>
        </div>
      </Drawer>

      <Drawer isOpen={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer Money">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {transferError && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>{transferError}</div>
          )}
          <Field label="From">
            <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} disabled={transferSubmitting}>
              <option value="">— Select account —</option>
              {(accounts || []).map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} ({inr(a.balance)})</option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} disabled={transferSubmitting}>
              <option value="">— Select account —</option>
              {(accounts || []).map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} ({inr(a.balance)})</option>
              ))}
            </Select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Amount (₹)">
              <NumberInput placeholder="0" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} disabled={transferSubmitting} />
            </Field>
            <Field label="Date">
              <DateField value={transferDate} onChange={(e) => setTransferDate(e.target.value)} disabled={transferSubmitting} />
            </Field>
          </div>
          <Field label="Notes">
            <TextInput placeholder="e.g. Daily banking / office float" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} disabled={transferSubmitting} />
          </Field>
          <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
            Records a paired out/in entry on both accounts (e.g. drawer → bank deposit, or a petty-cash float).
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={transferSubmitting} onClick={submitTransfer}>{transferSubmitting ? 'Recording…' : 'Record Transfer'}</button>
            <button className="btn btn-secondary btn-md" disabled={transferSubmitting} onClick={() => setTransferOpen(false)}>Cancel</button>
          </div>
        </div>
      </Drawer>
    </PageLayout>
  );
};
