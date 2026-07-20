import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageLayout } from '../primitives/PageLayout.js';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { KpiStrip, KpiTile, Panel, Button, Chip, StatusChip, EmptyState } from '../../pump-ds/index.js';
import { DataTable } from '../primitives/DataTable.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { LedgerView } from '../ledger/LedgerView.js';
import { DateRangeField, computeRange, type DateRange } from '../primitives/DateRangeField.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useFinancialAccounts, useAccountLedger, queryKeys } from '../../query/hooks.js';
import { CloudFinanceService } from '../../services/cloud.js';
import { inr } from '../../utils/format.js';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet, ArrowLeft, ArrowLeftRight, Banknote } from 'lucide-react';

const financeSvc = new CloudFinanceService();

type AccountType = 'CASH_IN_HAND' | 'PETTY_CASH' | 'BANK' | 'MERCHANT_CLEARING' | 'CMS' | 'OWNER';

const TYPE_LABEL: Record<AccountType, string> = {
  CASH_IN_HAND: 'Cash in Hand',
  PETTY_CASH: 'Petty Cash',
  BANK: 'Bank',
  MERCHANT_CLEARING: 'Card/UPI Clearing',
  CMS: 'OMC Card Settlement (CMS)',
  OWNER: 'Owner',
};

const TYPE_TONE: Record<AccountType, 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  CASH_IN_HAND: 'success',
  PETTY_CASH: 'neutral',
  BANK: 'info',
  MERCHANT_CLEARING: 'warning',
  CMS: 'info',
  OWNER: 'brand',
};

const SOURCE_LABEL: Record<string, string> = {
  OPENING: 'Opening balance',
  SALE_CASH: 'Cash sale',
  SALE_CARD: 'Card/UPI sale',
  SALE_OMC: 'OMC card sale',
  COLLECTION: 'Collection',
  EXPENSE: 'Expense',
  SUPPLIER_PAYMENT: 'Supplier payment',
  DEPOSIT: 'Cash deposit',
  TRANSFER: 'Transfer',
  SETTLEMENT: 'Settlement',
  BANK_CHARGE: 'Bank charge',
  INTEREST: 'Interest',
  ADJUSTMENT: 'Adjustment',
};

export interface AccountsPanelProps {
  selectedStation: any | null;
}

const accountColumns: ColumnDef<any, any>[] = [
  {
    accessorKey: 'name',
    header: 'Account',
    cell: ({ row }) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{row.original.name}</span>
        {row.original.isActive === false && <StatusChip status="inactive" size="xs" />}
      </span>
    ),
  },
  {
    accessorKey: 'accountType',
    header: 'Type',
    cell: ({ getValue }) => {
      const t = getValue() as AccountType;
      return <Chip tone={TYPE_TONE[t] ?? 'neutral'} size="xs">{TYPE_LABEL[t] ?? t}</Chip>;
    },
  },
  {
    accessorKey: 'balance',
    header: 'Balance',
    cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: Number(getValue()) < 0 ? 'var(--brand-danger)' : 'var(--text-strong)' }}>{inr(getValue())}</span>,
  },
];

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

  // Overview totals for the list header (cash = cash-in-hand + petty cash).
  const overview = useMemo(() => {
    let cash = 0, bank = 0, clearing = 0, net = 0;
    for (const a of accounts || []) {
      const b = Number(a.balance || 0);
      net += b;
      if (a.accountType === 'CASH_IN_HAND' || a.accountType === 'PETTY_CASH') cash += b;
      else if (a.accountType === 'BANK') bank += b;
      else if (a.accountType === 'MERCHANT_CLEARING') clearing += b;
    }
    return { cash, bank, clearing, net };
  }, [accounts]);

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

  // Settlement drawer state (clearing → bank, net of MDR)
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleBankId, setSettleBankId] = useState('');
  const [settleGross, setSettleGross] = useState('');
  const [settleFee, setSettleFee] = useState('');
  const [settleDate, setSettleDate] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);

  // Manual entry drawer (bank charge / interest / adjustment / opening balance)
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<'CHARGE' | 'INTEREST_PAID' | 'INTEREST_EARNED' | 'ADJ_IN' | 'ADJ_OUT' | 'OPENING'>('CHARGE');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  const selected = useMemo(() => (accounts || []).find((a: any) => a.id === selectedId) || null, [accounts, selectedId]);
  const { data: ledger, isLoading: ledgerLoading } = useAccountLedger(selectedId, { from: range.from, to: range.to });

  const openSettle = () => {
    const banks = (accounts || []).filter((a: any) => a.accountType === 'BANK');
    setSettleBankId(banks[0]?.id ?? '');
    setSettleGross(selected ? String(Number(selected.balance) || '') : '');
    setSettleFee('');
    setSettleDate('');
    setSettleNotes('');
    setSettleError(null);
    setSettleOpen(true);
  };

  const submitSettle = async () => {
    if (!selected) return;
    if (!settleBankId) {
      setSettleError('Choose the bank the batch settles into.');
      return;
    }
    if (!(Number(settleGross) > 0)) {
      setSettleError('Enter the gross batch amount.');
      return;
    }
    if (Number(settleFee || 0) > Number(settleGross)) {
      setSettleError('Fee cannot exceed the gross amount.');
      return;
    }
    setSettleSubmitting(true);
    setSettleError(null);
    try {
      await financeSvc.recordSettlement({
        clearingAccountId: selected.id,
        bankAccountId: settleBankId,
        grossAmount: Number(settleGross),
        feeAmount: Number(settleFee) || 0,
        date: settleDate || null,
        notes: settleNotes || null,
      });
      setSettleOpen(false);
      await qc.invalidateQueries({ queryKey: queryKeys.financialAccounts(stationId ?? '') });
      await qc.invalidateQueries({ queryKey: ['account-ledger'] });
      toast.success('Settlement recorded.');
    } catch (err: any) {
      setSettleError(err.message || 'Failed to record settlement.');
    } finally {
      setSettleSubmitting(false);
    }
  };

  const ENTRY_KIND: Record<string, { direction: 'in' | 'out'; sourceType: 'BANK_CHARGE' | 'INTEREST' | 'ADJUSTMENT'; label: string }> = {
    CHARGE: { direction: 'out', sourceType: 'BANK_CHARGE', label: 'Bank charge / fee' },
    INTEREST_PAID: { direction: 'out', sourceType: 'INTEREST', label: 'Interest paid' },
    INTEREST_EARNED: { direction: 'in', sourceType: 'INTEREST', label: 'Interest earned' },
    ADJ_IN: { direction: 'in', sourceType: 'ADJUSTMENT', label: 'Adjustment (add)' },
    ADJ_OUT: { direction: 'out', sourceType: 'ADJUSTMENT', label: 'Adjustment (deduct)' },
  };

  const openEntry = () => {
    setEntryKind('CHARGE');
    setEntryAmount('');
    setEntryDate('');
    setEntryNotes('');
    setEntryError(null);
    setEntryOpen(true);
  };

  // Switching to "Set opening balance" prefills the account's current opening figure/date.
  const changeEntryKind = (kind: typeof entryKind) => {
    setEntryKind(kind);
    setEntryError(null);
    if (kind === 'OPENING') {
      setEntryAmount(selected ? String(Number(selected.openingBalance) || '') : '');
      setEntryDate(selected?.openingDate || '');
    }
  };

  const submitEntry = async () => {
    if (!selected) return;

    // Opening balance is a special entry: it rewrites the account's OPENING
    // ledger entry (0 and negative allowed — negative = overdrawn OD account).
    if (entryKind === 'OPENING') {
      const opening = Number(entryAmount);
      if (!Number.isFinite(opening)) {
        setEntryError('Enter a valid opening balance (0 is allowed).');
        return;
      }
      setEntrySubmitting(true);
      setEntryError(null);
      try {
        await financeSvc.setOpeningBalance(selected.id, { openingBalance: opening, openingDate: entryDate || null });
        setEntryOpen(false);
        await qc.invalidateQueries({ queryKey: queryKeys.financialAccounts(stationId ?? '') });
        await qc.invalidateQueries({ queryKey: ['account-ledger'] });
        toast.success('Opening balance updated.');
      } catch (err: any) {
        setEntryError(err.message || 'Failed to update opening balance.');
      } finally {
        setEntrySubmitting(false);
      }
      return;
    }

    if (!(Number(entryAmount) > 0)) {
      setEntryError('Enter an amount greater than zero.');
      return;
    }
    setEntrySubmitting(true);
    setEntryError(null);
    try {
      const kind = ENTRY_KIND[entryKind];
      await financeSvc.recordAdjustment(selected.id, {
        direction: kind.direction,
        amount: Number(entryAmount),
        sourceType: kind.sourceType,
        date: entryDate || null,
        notes: entryNotes || kind.label,
      });
      setEntryOpen(false);
      await qc.invalidateQueries({ queryKey: queryKeys.financialAccounts(stationId ?? '') });
      await qc.invalidateQueries({ queryKey: ['account-ledger'] });
      toast.success('Entry recorded.');
    } catch (err: any) {
      setEntryError(err.message || 'Failed to record entry.');
    } finally {
      setEntrySubmitting(false);
    }
  };

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
          <div style={{ display: 'flex', gap: '8px' }}>
            {selected.accountType === 'MERCHANT_CLEARING' && (
              <Button variant="primary" size="sm" leftIcon={<Banknote />} onClick={openSettle}>Settle to bank</Button>
            )}
            <Button variant="secondary" size="sm" leftIcon={<Plus />} onClick={openEntry}>Add entry</Button>
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft />} onClick={() => setSelectedId(null)}>All accounts</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <DateRangeField value={range} onChange={setRange} clock={clock} size="sm" />
          <KpiStrip columns="auto">
            <KpiTile dot="brand" label="Opening" value={inr(opening)} />
            <KpiTile dot="success" valueTone="success" label="Money In" value={inr(totals.moneyIn)} />
            <KpiTile dot="danger" valueTone="danger" label="Money Out" value={inr(totals.moneyOut)} />
            <KpiTile dot={closing < 0 ? 'danger' : 'brand'} valueTone={closing < 0 ? 'danger' : undefined} label="Closing" value={inr(closing)} />
          </KpiStrip>
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
              notes: e.sourceType === 'SALE_OMC'
                ? ([e.omcCustomerName, e.omcVehicle, e.omcQuantity ? `${e.omcQuantity} L` : null, e.omcNotes].filter(Boolean).join(' · ') || e.notes || 'OMC card (no customer)')
                : (e.notes ?? undefined),
              amount: Number(e.amount || 0),
              direction: e.direction === 'in' ? 'debit' : 'credit',
            })}
          />
        </div>

        <Drawer isOpen={settleOpen} onClose={() => setSettleOpen(false)} title="Settle to Bank">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {settleError && (
              <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>{settleError}</div>
            )}
            <Field label="Settle into (Bank)">
              <Select value={settleBankId} onChange={(e) => setSettleBankId(e.target.value)} disabled={settleSubmitting}>
                <option value="">— Select bank —</option>
                {(accounts || []).filter((a: any) => a.accountType === 'BANK').map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Gross Batch (₹)">
                <NumberInput placeholder="0" value={settleGross} onChange={(e) => setSettleGross(e.target.value)} disabled={settleSubmitting} />
              </Field>
              <Field label="MDR / Fee (₹)">
                <NumberInput placeholder="0" value={settleFee} onChange={(e) => setSettleFee(e.target.value)} disabled={settleSubmitting} />
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Net to bank</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(Math.max(0, (Number(settleGross) || 0) - (Number(settleFee) || 0)))}</strong>
            </div>
            <Field label="Date">
              <DateField value={settleDate} onChange={(e) => setSettleDate(e.target.value)} disabled={settleSubmitting} />
            </Field>
            <Field label="Notes">
              <TextInput placeholder="e.g. HDFC POS batch 05-Jul" value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} disabled={settleSubmitting} />
            </Field>
            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
              Clearing drops by the gross; bank rises by the net; the fee is booked as a cost.
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="primary" size="md" fullWidth loading={settleSubmitting} onClick={submitSettle}>Record Settlement</Button>
              <Button variant="secondary" size="md" disabled={settleSubmitting} onClick={() => setSettleOpen(false)}>Cancel</Button>
            </div>
          </div>
        </Drawer>

        <Drawer isOpen={entryOpen} onClose={() => setEntryOpen(false)} title="Add Entry">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {entryError && (
              <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>{entryError}</div>
            )}
            <Field label="Type">
              <Select value={entryKind} onChange={(e) => changeEntryKind(e.target.value as any)} disabled={entrySubmitting}>
                <option value="CHARGE">Bank charge / fee (out)</option>
                <option value="INTEREST_PAID">Interest paid — e.g. OD (out)</option>
                <option value="INTEREST_EARNED">Interest earned (in)</option>
                <option value="ADJ_IN">Adjustment — add (in)</option>
                <option value="ADJ_OUT">Adjustment — deduct (out)</option>
                <option value="OPENING">Set opening balance</option>
              </Select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label={entryKind === 'OPENING' ? 'Opening balance (₹)' : 'Amount (₹)'}>
                <NumberInput placeholder="0" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} disabled={entrySubmitting} />
              </Field>
              <Field label={entryKind === 'OPENING' ? 'As of' : 'Date'}>
                <DateField value={entryDate} onChange={(e) => setEntryDate(e.target.value)} disabled={entrySubmitting} />
              </Field>
            </div>
            {entryKind !== 'OPENING' && (
              <Field label="Notes">
                <TextInput placeholder="e.g. Quarterly account maintenance fee" value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} disabled={entrySubmitting} />
              </Field>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
              {entryKind === 'OPENING'
                ? 'Sets the balance the account started with (negative = overdrawn OD account). Rewrites the opening entry only — later movements are untouched.'
                : 'Record bank-originated items (charges, fees, interest) so your book balance matches the statement.'}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="primary" size="md" fullWidth loading={entrySubmitting} onClick={submitEntry}>
                {entryKind === 'OPENING' ? 'Save Opening Balance' : 'Add Entry'}
              </Button>
              <Button variant="secondary" size="md" disabled={entrySubmitting} onClick={() => setEntryOpen(false)}>Cancel</Button>
            </div>
          </div>
        </Drawer>
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
          <Button variant="secondary" size="sm" leftIcon={<ArrowLeftRight />} onClick={openTransfer} disabled={(accounts || []).length < 2}>Transfer</Button>
          <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openCreate}>New Account</Button>
        </div>
      }
    >
      {isLoading ? (
        <LoadingSpinner />
      ) : (accounts || []).length === 0 ? (
        <EmptyState icon={<Wallet />} title="No accounts yet" description="Create a bank / petty-cash / owner account, or record a collection or expense — system accounts (Cash in Hand, Bank) appear automatically." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <KpiStrip columns="auto">
            <KpiTile dot={overview.cash < 0 ? 'danger' : 'success'} valueTone={overview.cash < 0 ? 'danger' : undefined} label="Cash" value={inr(overview.cash)} hint="in hand + petty" />
            <KpiTile dot={overview.bank < 0 ? 'danger' : 'info'} valueTone={overview.bank < 0 ? 'danger' : undefined} label="Bank" value={inr(overview.bank)} />
            <KpiTile dot="warning" label="Card/UPI Clearing" value={inr(overview.clearing)} hint="awaiting settlement" />
            <KpiTile dot={overview.net < 0 ? 'danger' : 'brand'} valueTone={overview.net < 0 ? 'danger' : undefined} label="Net Position" value={inr(overview.net)} />
          </KpiStrip>

          <Panel flush title="Accounts">
            <DataTable
              bare
              columns={accountColumns}
              data={accounts || []}
              emptyMessage="No accounts."
              getRowId={(r: any) => r.id}
              onRowClick={(a: any) => { setSelectedId(a.id); setRange(computeRange('this-month', clock)); }}
            />
          </Panel>
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
              <option value="CMS">OMC Card Settlement (CMS)</option>
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
            The opening balance seeds the ledger. You can set or correct it later from the account's Add entry drawer.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="md" fullWidth loading={submitting} onClick={submit}>Create Account</Button>
            <Button variant="secondary" size="md" disabled={submitting} onClick={() => setDrawerOpen(false)}>Cancel</Button>
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
            <Button variant="primary" size="md" fullWidth loading={transferSubmitting} onClick={submitTransfer}>Record Transfer</Button>
            <Button variant="secondary" size="md" disabled={transferSubmitting} onClick={() => setTransferOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Drawer>
    </PageLayout>
  );
};
