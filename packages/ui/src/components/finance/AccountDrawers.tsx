import React, { useState, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Button } from '../../pump-ds/index.js';
import { queryKeys } from '../../query/hooks.js';
import { CloudFinanceService } from '../../services/cloud.js';
import { formatMoney } from '../../utils/format.js';
import { ACCOUNT_TYPE_LABEL, type LedgerAccountType } from '../../utils/ledgerLabels.js';
import { isIdempotencyKeyConflict, keepsIdempotencyKey } from '../../utils/idempotency.js';
import { officeSubmitKeys } from '../../office-records/submitKeys.js';
import type { AccountRow } from './accountsModel.js';

const financeSvc = new CloudFinanceService();

/**
 * The Accounts drawers (#530): new account, transfer, settle to bank and add
 * entry. Each mounts fresh on open (the parent keys it), so its form starts
 * from its defaults.
 *
 * Every save sends one Idempotency-Key per logical submit (#574), through the
 * Office Record key store (#526/#564): the key is kept while the outcome is
 * unknown (no answer, a 5xx, in progress, or an edited retry refused), and
 * renewed after a decided answer. A retry after a dropped response therefore
 * cannot move money twice.
 */

/**
 * A save under one Idempotency-Key. Scope it so a key is only ever reused on
 * the same route: the API refuses a key sent to another path.
 */
function useKeyedSave(scope: string) {
  const [session] = useState(() => officeSubmitKeys.session(`accounts:${scope}`));
  return async <T,>(body: unknown, send: (idempotencyKey: string) => Promise<T>): Promise<T> => {
    const key = session.next(JSON.stringify(body));
    try {
      const result = await send(key);
      session.settle();
      return result;
    } catch (err) {
      session.settle(err);
      throw err;
    }
  };
}

/** A failed save: plain text for a decided refusal, or a title and what to do. */
type FormErrorValue = string | { title: string; message: string };

/**
 * What a failed save tells the operator. While the outcome is unknown, saving
 * again is safe (same key); an edited retry the API refused may already be recorded.
 */
function saveFailure(err: any, what: string, fallback: string): FormErrorValue {
  if (isIdempotencyKeyConflict(err)) {
    return {
      title: `Couldn't save the edited ${what}.`,
      message:
        'Your earlier save may already be recorded. Check the list, then undo your edit or close and start again.',
    };
  }
  if (keepsIdempotencyKey(err)) {
    return {
      title: "Couldn't save. Check the connection and save again.",
      message: `Saving again sends the same ${what}, so it cannot be recorded twice.`,
    };
  }
  return err?.message || fallback;
}

/** Every money write refreshes balances, statements and the Daily cash book. */
async function invalidateMoney(qc: QueryClient, stationId: string | null) {
  await qc.invalidateQueries({ queryKey: queryKeys.financialAccounts(stationId ?? '') });
  await qc.invalidateQueries({ queryKey: queryKeys.fundingAccountsAll() });
  await qc.invalidateQueries({ queryKey: ['account-ledger'] });
  await qc.invalidateQueries({ queryKey: queryKeys.dailyCashBookPrefix() });
  await qc.invalidateQueries({ queryKey: queryKeys.financeMovementsPrefix() });
}

const FormError: React.FC<{ error: FormErrorValue }> = ({ error }) => (
  <div role="alert" className="rounded-input bg-danger-bg px-3 py-2.5 text-[12px] text-danger-fg">
    {typeof error === 'string' ? (
      error
    ) : (
      <>
        <strong className="block font-semibold">{error.title}</strong>
        {error.message}
      </>
    )}
  </div>
);

const Note: React.FC<{ children: ReactNode }> = ({ children }) => (
  <p className="text-[12px] text-ink-muted">{children}</p>
);

const Actions: React.FC<{
  label: string;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ label, submitting, onSubmit, onCancel }) => (
  <div className="flex gap-2">
    <Button variant="primary" size="md" fullWidth loading={submitting} onClick={onSubmit}>
      {label}
    </Button>
    <Button variant="secondary" size="md" disabled={submitting} onClick={onCancel}>
      Cancel
    </Button>
  </div>
);

interface BaseDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stationId: string | null;
  /** The Entry Date to default to (station calendar, ADR 0005). */
  today: string;
}

// ---- New account ---------------------------------------------------------

const NEW_ACCOUNT_TYPES: { value: LedgerAccountType; label: string }[] = [
  { value: 'BANK', label: 'Bank' },
  { value: 'PETTY_CASH', label: 'Petty cash' },
  { value: 'CASH_IN_HAND', label: 'Cash in hand' },
  { value: 'MERCHANT_CLEARING', label: 'Card/UPI clearing' },
  { value: 'CMS', label: 'OMC card settlement (CMS)' },
  { value: 'OWNER', label: 'Owner' },
];

export const NewAccountDrawer: React.FC<Omit<BaseDrawerProps, 'today'>> = ({
  isOpen,
  onClose,
  stationId,
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [accountType, setAccountType] = useState<LedgerAccountType>('BANK');
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FormErrorValue | null>(null);
  const save = useKeyedSave(`create:${stationId}`);

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
      const payload = {
        stationId,
        accountType,
        name: name.trim(),
        openingBalance: Number(openingBalance) || 0,
        openingDate: openingDate || null,
        metadata: Object.keys(metadata).length ? metadata : null,
      };
      await save(payload, (idempotencyKey) =>
        financeSvc.createAccount(payload, { idempotencyKey }),
      );
      onClose();
      await qc.invalidateQueries({ queryKey: queryKeys.financialAccounts(stationId ?? '') });
      await qc.invalidateQueries({ queryKey: queryKeys.fundingAccountsAll() });
      toast.success('Account created.');
    } catch (err: any) {
      setError(saveFailure(err, 'account', 'Failed to create account.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="New account">
      <div className="flex flex-col gap-3.5">
        {error && <FormError error={error} />}
        <Field label="Type">
          <Select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as LedgerAccountType)}
            disabled={submitting}
          >
            {NEW_ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <TextInput
            placeholder={ACCOUNT_TYPE_LABEL[accountType]}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
        </Field>
        {accountType === 'BANK' && (
          <>
            <Field label="Bank name">
              <TextInput
                placeholder="e.g. HDFC Bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account no.">
                <TextInput
                  placeholder="****1234"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label="IFSC">
                <TextInput
                  placeholder="HDFC0000123"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value)}
                  disabled={submitting}
                />
              </Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening balance (₹)">
            <NumberInput
              placeholder="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="As of">
            <DateField
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
              disabled={submitting}
            />
          </Field>
        </div>
        <Note>
          The opening balance seeds the ledger. You can set or correct it later from the
          account&apos;s Add entry drawer.
        </Note>
        <Actions
          label="Create account"
          submitting={submitting}
          onSubmit={() => void submit()}
          onCancel={onClose}
        />
      </div>
    </Drawer>
  );
};

// ---- Transfer ------------------------------------------------------------

export const TransferDrawer: React.FC<BaseDrawerProps & { accounts: readonly AccountRow[] }> = ({
  isOpen,
  onClose,
  stationId,
  today,
  accounts,
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<FormErrorValue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const save = useKeyedSave(`transfer:${stationId}`);

  const submit = async () => {
    if (!fromAccountId || !toAccountId) {
      setError('Choose both accounts.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setError('From and To must be different accounts.');
      return;
    }
    if (!(Number(amount) > 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        fromAccountId,
        toAccountId,
        amount: Number(amount),
        date: date || null,
        notes: notes || null,
      };
      await save(payload, (idempotencyKey) =>
        financeSvc.recordTransfer(payload, { idempotencyKey }),
      );
      onClose();
      await invalidateMoney(qc, stationId);
      toast.success('Transfer recorded.');
    } catch (err: any) {
      setError(saveFailure(err, 'transfer', 'Failed to record transfer.'));
    } finally {
      setSubmitting(false);
    }
  };

  const options = accounts.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} ({formatMoney(a.balance)})
    </option>
  ));

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Transfer money">
      <div className="flex flex-col gap-3.5">
        {error && <FormError error={error} />}
        <Field label="From">
          <Select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            disabled={submitting}
          >
            <option value="">— Select account —</option>
            {options}
          </Select>
        </Field>
        <Field label="To">
          <Select
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            disabled={submitting}
          >
            <option value="">— Select account —</option>
            {options}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <NumberInput
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="Date">
            <DateField
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
            />
          </Field>
        </div>
        <Field label="Notes">
          <TextInput
            placeholder="e.g. Daily banking / office float"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Note>
          Records a paired out/in entry on both accounts (e.g. drawer → bank deposit, or a
          petty-cash float).
        </Note>
        <Actions
          label="Record transfer"
          submitting={submitting}
          onSubmit={() => void submit()}
          onCancel={onClose}
        />
      </div>
    </Drawer>
  );
};

// ---- Settle to bank (clearing → bank, net of MDR) -------------------------

export const SettleDrawer: React.FC<
  BaseDrawerProps & { account: AccountRow; accounts: readonly AccountRow[] }
> = ({ isOpen, onClose, stationId, today, account, accounts }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const banks = accounts.filter((a) => a.accountType === 'BANK');
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [gross, setGross] = useState(String(Number(account.balance) || ''));
  const [fee, setFee] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<FormErrorValue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const save = useKeyedSave(`settle:${stationId}`);

  const submit = async () => {
    if (!bankId) {
      setError('Choose the bank the batch settles into.');
      return;
    }
    if (!(Number(gross) > 0)) {
      setError('Enter the gross batch amount.');
      return;
    }
    if (Number(fee || 0) > Number(gross)) {
      setError('Fee cannot exceed the gross amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        clearingAccountId: account.id,
        bankAccountId: bankId,
        grossAmount: Number(gross),
        feeAmount: Number(fee) || 0,
        date: date || null,
        notes: notes || null,
      };
      await save(payload, (idempotencyKey) =>
        financeSvc.recordSettlement(payload, { idempotencyKey }),
      );
      onClose();
      await invalidateMoney(qc, stationId);
      toast.success('Settlement recorded.');
    } catch (err: any) {
      setError(saveFailure(err, 'settlement', 'Failed to record settlement.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Settle to bank">
      <div className="flex flex-col gap-3.5">
        {error && <FormError error={error} />}
        <Field label="Settle into (bank)">
          <Select value={bankId} onChange={(e) => setBankId(e.target.value)} disabled={submitting}>
            <option value="">— Select bank —</option>
            {banks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gross batch (₹)">
            <NumberInput
              placeholder="0"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="MDR / fee (₹)">
            <NumberInput
              placeholder="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              disabled={submitting}
            />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-input border border-border-soft bg-surface-alt px-3 py-2.5 text-[13px]">
          <span className="font-semibold text-ink-muted">Net to bank</span>
          <strong className="font-mono text-ink-strong">
            {formatMoney(Math.max(0, (Number(gross) || 0) - (Number(fee) || 0)))}
          </strong>
        </div>
        <Field label="Date">
          <DateField value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
        </Field>
        <Field label="Notes">
          <TextInput
            placeholder="e.g. HDFC POS batch 05-Jul"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Note>
          Clearing drops by the gross; bank rises by the net; the fee is booked as a cost.
        </Note>
        <Actions
          label="Record settlement"
          submitting={submitting}
          onSubmit={() => void submit()}
          onCancel={onClose}
        />
      </div>
    </Drawer>
  );
};

// ---- Add entry (bank charge / interest / adjustment / opening balance) ----

type EntryKind = 'CHARGE' | 'INTEREST_PAID' | 'INTEREST_EARNED' | 'ADJ_IN' | 'ADJ_OUT' | 'OPENING';

const ENTRY_KIND: Record<
  Exclude<EntryKind, 'OPENING'>,
  { direction: 'in' | 'out'; sourceType: 'BANK_CHARGE' | 'INTEREST' | 'ADJUSTMENT'; label: string }
> = {
  CHARGE: { direction: 'out', sourceType: 'BANK_CHARGE', label: 'Bank charge / fee' },
  INTEREST_PAID: { direction: 'out', sourceType: 'INTEREST', label: 'Interest paid' },
  INTEREST_EARNED: { direction: 'in', sourceType: 'INTEREST', label: 'Interest earned' },
  ADJ_IN: { direction: 'in', sourceType: 'ADJUSTMENT', label: 'Adjustment (add)' },
  ADJ_OUT: { direction: 'out', sourceType: 'ADJUSTMENT', label: 'Adjustment (deduct)' },
};

export const AddEntryDrawer: React.FC<BaseDrawerProps & { account: AccountRow }> = ({
  isOpen,
  onClose,
  stationId,
  today,
  account,
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<EntryKind>('CHARGE');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<FormErrorValue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // An entry and an opening balance go to different routes, so each has its own key.
  const saveEntry = useKeyedSave(`entry:${account.id}`);
  const saveOpening = useKeyedSave(`opening:${account.id}`);
  const opening = kind === 'OPENING';

  // Switching to "Set opening balance" prefills the account's current opening figure/date.
  const changeKind = (next: EntryKind) => {
    setKind(next);
    setError(null);
    if (next === 'OPENING') {
      setAmount(String(Number(account.openingBalance) || ''));
      setDate(account.openingDate || '');
    }
  };

  const submit = async () => {
    // Opening balance is a special entry: it rewrites the account's OPENING
    // ledger entry (0 and negative allowed — negative = overdrawn OD account).
    if (opening) {
      const value = Number(amount);
      if (!Number.isFinite(value)) {
        setError('Enter a valid opening balance (0 is allowed).');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const payload = { openingBalance: value, openingDate: date || null };
        await saveOpening(payload, (idempotencyKey) =>
          financeSvc.setOpeningBalance(account.id, payload, { idempotencyKey }),
        );
        onClose();
        await invalidateMoney(qc, stationId);
        toast.success('Opening balance updated.');
      } catch (err: any) {
        setError(saveFailure(err, 'opening balance', 'Failed to update opening balance.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!(Number(amount) > 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const k = ENTRY_KIND[kind];
      const payload = {
        direction: k.direction,
        amount: Number(amount),
        sourceType: k.sourceType,
        date: date || null,
        notes: notes || k.label,
      };
      await saveEntry(payload, (idempotencyKey) =>
        financeSvc.recordAdjustment(account.id, payload, { idempotencyKey }),
      );
      onClose();
      await invalidateMoney(qc, stationId);
      toast.success('Entry recorded.');
    } catch (err: any) {
      setError(saveFailure(err, 'entry', 'Failed to record entry.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Add entry">
      <div className="flex flex-col gap-3.5">
        {error && <FormError error={error} />}
        <Field label="Type">
          <Select
            value={kind}
            onChange={(e) => changeKind(e.target.value as EntryKind)}
            disabled={submitting}
          >
            <option value="CHARGE">Bank charge / fee (out)</option>
            <option value="INTEREST_PAID">Interest paid — e.g. OD (out)</option>
            <option value="INTEREST_EARNED">Interest earned (in)</option>
            <option value="ADJ_IN">Adjustment — add (in)</option>
            <option value="ADJ_OUT">Adjustment — deduct (out)</option>
            <option value="OPENING">Set opening balance</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={opening ? 'Opening balance (₹)' : 'Amount (₹)'}>
            <NumberInput
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={opening ? 'As of' : 'Date'}>
            <DateField
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
            />
          </Field>
        </div>
        {!opening && (
          <Field label="Notes">
            <TextInput
              placeholder="e.g. Quarterly account maintenance fee"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
          </Field>
        )}
        <Note>
          {opening
            ? 'Sets the balance the account started with (negative = overdrawn OD account). Rewrites the opening entry only — later movements are untouched.'
            : 'Record bank-originated items (charges, fees, interest) so your book balance matches the statement.'}
        </Note>
        <Actions
          label={opening ? 'Save opening balance' : 'Add entry'}
          submitting={submitting}
          onSubmit={() => void submit()}
          onCancel={onClose}
        />
      </div>
    </Drawer>
  );
};

// ---- Host ------------------------------------------------------------------

export type AccountDrawer = 'create' | 'transfer' | 'settle' | 'entry';

export interface AccountDrawersProps {
  drawer: AccountDrawer | null;
  onClose: () => void;
  stationId: string | null;
  today: string;
  accounts: readonly AccountRow[];
  /** The account whose statement is open: settle and add entry act on it. */
  selected: AccountRow | null;
}

/** The page's drawers. Key it per open so the open drawer starts from its defaults. */
export const AccountDrawers: React.FC<AccountDrawersProps> = ({
  drawer,
  onClose,
  stationId,
  today,
  accounts,
  selected,
}) => (
  <>
    <NewAccountDrawer isOpen={drawer === 'create'} onClose={onClose} stationId={stationId} />
    <TransferDrawer
      isOpen={drawer === 'transfer'}
      onClose={onClose}
      stationId={stationId}
      today={today}
      accounts={accounts}
    />
    {selected && (
      <>
        <SettleDrawer
          isOpen={drawer === 'settle'}
          onClose={onClose}
          stationId={stationId}
          today={today}
          account={selected}
          accounts={accounts}
        />
        <AddEntryDrawer
          isOpen={drawer === 'entry'}
          onClose={onClose}
          stationId={stationId}
          today={today}
          account={selected}
        />
      </>
    )}
  </>
);
