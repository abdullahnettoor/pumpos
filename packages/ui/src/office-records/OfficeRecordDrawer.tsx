import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  canManageExpenseCategory,
  canManageFinancialAccounts,
  resolveBusinessDate,
  resolveEntryDate,
  type Role,
} from '@pump/shared';
import { Drawer } from '../components/Drawer.js';
import { Banner } from '../components/primitives/Banner.js';
import { Checkbox } from '../components/primitives/Toggle.js';
import { useToast } from '../components/primitives/ToastProvider.js';
import { PurchaseEntryForm } from '../components/transactions/PurchaseEntryForm.js';
import { Button, ConceptIcon } from '../pump-ds/index.js';
import {
  useCustomers,
  useExpenseCategories,
  useFinancialAccounts,
  useFundingAccounts,
  useIncomeCategories,
  useInvalidateOperational,
  usePaymentTerminals,
  useProducts,
  useSuppliers,
} from '../query/hooks.js';
import { keepsIdempotencyKey } from '../utils/idempotency.js';
import { useRunTask } from '../utils/runTask.js';
import { OfficeRecordContext, type OfficeRecordContextValue } from './context.js';
import type { FormDraft } from './draft.js';
import type { PartyOption } from './fields/PartyField.js';
import { CategoryRecordForm } from './forms/CategoryRecordForm.js';
import { CollectionForm } from './forms/CollectionForm.js';
import { SupplierPaymentForm } from './forms/SupplierPaymentForm.js';
import {
  OFFICE_RECORD_KINDS,
  PREVIEW_SIDE_QUERY,
  officeRecordContext,
  officeRecordDrawerWidth,
  type OfficeRecordKind,
  type OfficeRecordLaunch,
} from './kinds.js';
import { buildOfficeRecordPreview } from './preview.js';
import { PreviewCards, PreviewStrip, type PreviewViewProps } from './PreviewPanel.js';
import { officeRecordRequest, type OfficeRecordSubmission } from './send.js';
import { officeSubmitKeys } from './submitKeys.js';
import { useMediaQuery } from './useMediaQuery.js';
import { usePriorRecords } from './usePriorRecords.js';

export interface OfficeRecordDrawerProps {
  /** The kind to record; null keeps the drawer closed. */
  kind: OfficeRecordKind | null;
  /** Changes on every open, so each open starts a fresh record. */
  openToken?: number;
  station: { id: string; settings?: Record<string, any> | null } | null;
  userRole: Role;
  launch?: OfficeRecordLaunch;
  onClose: () => void;
}

/**
 * The one drawer for recording an Office Record (#526), opened the same way
 * from a page, the New menu, a statement or Shifts: a form per kind, a live
 * preview (a strip above the footer, or beside the form on a wide window) and
 * a pinned footer with "Add another after saving", Cancel and Record.
 */
export const OfficeRecordDrawer: React.FC<OfficeRecordDrawerProps> = ({
  kind,
  openToken = 0,
  ...rest
}) => {
  if (!kind || !rest.station) return null;
  return (
    <OfficeRecordSession
      key={`${kind}:${openToken}`}
      kind={kind}
      {...rest}
      station={rest.station}
    />
  );
};

type Carry = Record<string, unknown>;

const SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'Ctrl↵';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toParty = (row: any): PartyOption => ({
  id: row.id,
  name: row.name,
  balance: num(row.currentBalance),
});

/** What "Add another after saving" keeps: the date, account and method. */
function carryOver(submission: OfficeRecordSubmission): Carry {
  const v = submission.values as Record<string, unknown>;
  const keep = (...names: string[]) =>
    Object.fromEntries(names.filter((n) => v[n]).map((n) => [n, v[n]]));
  switch (submission.kind) {
    case 'collection':
      return keep('entryDate', 'fundingAccountId', 'paymentMethod');
    case 'purchase':
      return keep('transactionDate');
    default:
      return keep('entryDate', 'fundingAccountId');
  }
}

const OfficeRecordSession: React.FC<
  Omit<OfficeRecordDrawerProps, 'kind' | 'openToken' | 'station'> & {
    kind: OfficeRecordKind;
    station: NonNullable<OfficeRecordDrawerProps['station']>;
  }
> = ({ kind, station, userRole, launch, onClose }) => {
  const def = OFFICE_RECORD_KINDS[kind];
  const stationId = station.id;
  const settings = (station.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const today = resolveEntryDate({ timeZone: settings.timezone });
  const businessDate = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });
  const toast = useToast();
  const runTask = useRunTask();
  const invalidateOperational = useInvalidateOperational();
  const side = useMediaQuery(PREVIEW_SIDE_QUERY);
  const formId = `office-record-${kind}`;

  // ---- lookups, each read only by the kinds that need it ----
  const isCategory = kind === 'expense' || kind === 'income';
  const expenseCatsQ = useExpenseCategories({ enabled: kind === 'expense' });
  const incomeCatsQ = useIncomeCategories({ enabled: kind === 'income' });
  const customersQ = useCustomers(true, { enabled: kind === 'collection' });
  const suppliersQ = useSuppliers(true, {
    enabled: kind === 'purchase' || kind === 'supplier-payment',
  });
  const productsQ = useProducts({ enabled: kind === 'purchase' });
  const fundingQ = useFundingAccounts(stationId);
  const terminalsQ = usePaymentTerminals(stationId, { enabled: kind === 'collection' });
  const seesBalances = canManageFinancialAccounts(userRole);
  const balancesQ = useFinancialAccounts(stationId, { enabled: seesBalances });
  const prior = usePriorRecords(kind);

  const categories = useMemo(
    () => (kind === 'income' ? incomeCatsQ.data : expenseCatsQ.data) ?? [],
    [kind, incomeCatsQ.data, expenseCatsQ.data],
  );
  const customers = useMemo(() => (customersQ.data ?? []).map(toParty), [customersQ.data]);
  const suppliers = useMemo(() => (suppliersQ.data ?? []).map(toParty), [suppliersQ.data]);
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    if (!seesBalances) return map;
    for (const a of balancesQ.data ?? []) {
      const b = num(a.balance);
      if (b != null) map.set(a.id, b);
    }
    return map;
  }, [seesBalances, balancesQ.data]);
  const locked: PartyOption | null = launch?.party ? toParty(launch.party) : null;

  // ---- session state ----
  const [session] = useState(() => officeSubmitKeys.session(`${kind}:${stationId}`));
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ message: string; unknown: boolean } | null>(null);
  const [addAnother, setAddAnother] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [round, setRound] = useState(0);
  const [carry, setCarry] = useState<Carry>({});
  const defaults = useMemo(() => ({ ...(launch?.defaults ?? {}), ...carry }), [launch, carry]);
  const onDraftChange = useCallback((d: FormDraft) => setDraft(d), []);

  const save = async (submission: OfficeRecordSubmission) => {
    const request = officeRecordRequest(stationId, submission);
    const key = session.next(JSON.stringify(request.body));
    setSubmitting(true);
    setFailure(null);
    try {
      await request.send(key);
    } catch (err: any) {
      session.settle(err);
      setFailure({
        message: err?.message || 'Check the details and try again.',
        unknown: keepsIdempotencyKey(err),
      });
      setSubmitting(false);
      return;
    }
    session.settle();
    setSubmitting(false);
    const paidToo = submission.kind === 'purchase' && !!submission.payment;
    toast.success(paidToo ? 'Purchase and supplier payment recorded.' : def.saved);
    runTask(
      invalidateOperational(stationId),
      `${def.label} recorded, but the screen could not be refreshed.`,
    );
    if (addAnother) {
      setCarry(carryOver(submission));
      setDraft(null);
      setRound((r) => r + 1);
    } else {
      onClose();
    }
  };

  const submit = useCallback(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    form?.requestSubmit();
  }, [formId]);

  // ⌘/Ctrl+Enter records from anywhere in the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!submitting) submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit, submitting]);

  // ---- preview ----
  const account = draft?.accountId
    ? (fundingQ.data ?? []).find((a) => a.id === draft.accountId)
    : undefined;
  const partyList = kind === 'collection' ? customers : suppliers;
  const party =
    locked ?? (draft?.partyId ? (partyList.find((p) => p.id === draft.partyId) ?? null) : null);
  const category = isCategory ? categories.find((c: any) => c.id === draft?.categoryId) : undefined;
  const terminal = draft?.terminalId
    ? (terminalsQ.data ?? []).find((t: any) => t.id === draft.terminalId)
    : undefined;
  const what = isCategory ? (category?.name ?? null) : (party?.name ?? null);
  const preview = buildOfficeRecordPreview(
    {
      kind,
      date: draft?.date ?? '',
      today,
      amount: draft?.amount ?? null,
      what,
      matchId: (isCategory ? draft?.categoryId : party?.id) ?? null,
      account: account
        ? { id: account.id, name: account.name, balance: balances.get(account.id) ?? null }
        : null,
      party: party ? { id: party.id, name: party.name, balance: party.balance ?? null } : null,
      terminal: terminal ? terminal.label : null,
      gstRate: kind === 'income' ? num(category?.taxConfig?.gst_rate) : null,
      purchase: draft?.purchase,
    },
    prior,
  );
  const productPurchase = kind === 'purchase' && draft?.purchase?.type === 'PRODUCTS';
  const view: PreviewViewProps = {
    kind,
    preview,
    what,
    amount: draft?.amount ?? null,
    date: draft?.date ?? '',
    dateLabel: productPurchase
      ? 'Business date'
      : kind === 'purchase'
        ? 'Invoice date'
        : 'Entry date',
    footnote: productPurchase
      ? "Shown in the Business Day's purchases and Product stock."
      : kind === 'purchase'
        ? 'Shown in the supplier statement and the ledger.'
        : 'Shown in the Daily cash book and the ledger. Not in the DSSR (office record).',
  };

  const ctx: OfficeRecordContextValue = {
    stationId,
    balances,
    disabled: submitting,
    today,
    businessDate,
  };

  const formProps = { formId, defaultValues: defaults as any, onDraftChange };
  const form = (() => {
    switch (kind) {
      case 'expense':
      case 'income':
        return (
          <CategoryRecordForm
            {...formProps}
            kind={kind}
            categories={categories}
            canAddCategory={canManageExpenseCategory(userRole)}
            onSubmit={(values) => save({ kind, values })}
          />
        );
      case 'collection':
        return (
          <CollectionForm
            {...formProps}
            customers={customers}
            lockedCustomer={locked}
            onSubmit={(values) => save({ kind, values })}
          />
        );
      case 'supplier-payment':
        return (
          <SupplierPaymentForm
            {...formProps}
            suppliers={suppliers}
            lockedSupplier={locked}
            onSubmit={(values) => save({ kind, values })}
          />
        );
      case 'purchase':
        return (
          <PurchaseEntryForm
            {...formProps}
            suppliers={suppliers}
            products={productsQ.data ?? []}
            lockedSupplier={locked}
            defaultType={launch?.purchaseType}
            onSubmit={(values, payment) => save({ kind, values, payment })}
          />
        );
    }
  })();

  const banner = failure && (
    <div className="mb-4">
      <Banner
        severity="danger"
        title={
          failure.unknown ? "Couldn't save. Check the connection and save again." : "Couldn't save."
        }
      >
        {failure.unknown
          ? 'Saving again sends the same record, so it cannot be recorded twice.'
          : failure.message}
      </Banner>
    </div>
  );

  const footer = (
    <div className="flex w-full items-center gap-2">
      <Checkbox
        label="Add another after saving"
        checked={addAnother}
        onChange={(e) => setAddAnother(e.target.checked)}
      />
      <span className="flex-1" />
      <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="primary"
        size="md"
        loading={submitting}
        disabled={!!draft?.blocked}
        onClick={submit}
        aria-keyshortcuts="Meta+Enter Control+Enter"
      >
        {def.title}
        <kbd aria-hidden="true" className="font-mono text-[10px] font-medium opacity-70">
          {SHORTCUT}
        </kbd>
      </Button>
    </div>
  );

  const body = (
    <div key={round}>
      {banner}
      {form}
    </div>
  );

  return (
    <OfficeRecordContext.Provider value={ctx}>
      <Drawer
        isOpen
        onClose={onClose}
        title={def.title}
        icon={<ConceptIcon concept={def.concept} size="md" />}
        subtitle={officeRecordContext({
          kind,
          origin: launch?.origin ?? 'page',
          shiftName: launch?.shiftName,
          purchaseType: draft?.purchase?.type ?? launch?.purchaseType,
          date: draft?.date,
        })}
        width={officeRecordDrawerWidth(kind, side)}
        flushBody
        footer={footer}
      >
        {side ? (
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto border-r border-border-soft px-6 py-5">
              {body}
            </div>
            <aside
              aria-label="Preview"
              className="w-[360px] shrink-0 overflow-y-auto bg-surface-alt px-5 py-5"
            >
              <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                What this records
              </h3>
              <PreviewCards {...view} />
            </aside>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
            <PreviewStrip {...view} expanded={expanded} onToggle={() => setExpanded((x) => !x)} />
          </>
        )}
      </Drawer>
    </OfficeRecordContext.Provider>
  );
};
