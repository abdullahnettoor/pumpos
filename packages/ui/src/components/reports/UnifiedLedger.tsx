import React, { useMemo, useState } from 'react';
import {
  useCustomers,
  useSuppliers,
  useCustomerLedger,
  useSupplierLedger,
  useMoneyMovements,
} from '../../query/hooks.js';
import { LedgerView } from '../ledger/LedgerView.js';
import type { LedgerResolved } from '../ledger/LedgerView.js';
import { KpiCard } from '../primitives/KpiCard.js';
import type { KpiTone } from '../primitives/KpiCard.js';
import { Combobox } from '../primitives/Combobox.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';

export interface UnifiedLedgerProps {
  selectedStation: any | null;
}

type EntityType = 'customer' | 'supplier' | 'cash' | 'bank' | 'owner';

const TYPE_OPTIONS = [
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'owner', label: 'Owner' },
];

const fmtDate = (v: any) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

interface LedgerSource {
  /** Requires picking a specific entity (customer/supplier). */
  needsEntity: boolean;
  /** Where the ledger rows come from when this type is committed. */
  moneyAccount?: 'Cash' | 'Bank' | 'Owner';
  amountLabel: string;
  balanceLabel: string;
  kpiDebitLabel: string;
  kpiCreditLabel: string;
  emptyText: string;
  caption: string;
  /** Maps a raw transaction into a running-balance row (debit raises balance). */
  resolve: (tx: any) => LedgerResolved;
  /** Tone of the closing-balance KPI given the net value. */
  balanceTone: (net: number) => KpiTone;
}

/**
 * Entity-aware ledger registry. Adding a new money entity later (employee,
 * fleet, GST, a specific bank account …) = one entry here — the view, picker,
 * running balance and KPIs are all driven from this map.
 */
const REGISTRY: Record<EntityType, LedgerSource> = {
  customer: {
    needsEntity: true,
    amountLabel: 'Amount',
    balanceLabel: 'Receivable',
    kpiDebitLabel: 'Credit Sales',
    kpiCreditLabel: 'Collections',
    emptyText: 'No transactions for this customer in the selected range.',
    caption: 'Debit = credit sale / adjustment · Credit = collection. Closing balance = amount receivable.',
    balanceTone: (net) => (net > 0 ? 'warning' : 'success'),
    resolve: (tx) => {
      const type = tx.transactionType;
      const direction: 'debit' | 'credit' =
        type === 'Credit Sale' || type === 'Adjustment' || type === 'Prepaid Top-up' ? 'debit' : 'credit';
      return {
        id: tx.id,
        date: tx.businessDate || tx.createdAt,
        dateLabel: fmtDate(tx.businessDate || tx.createdAt),
        type,
        typeColor:
          type === 'Credit Sale' ? 'var(--brand-warning)' : type === 'Prepaid Top-up' ? 'var(--state-success-fg)' : undefined,
        notes: tx.notes,
        amount: Number(tx.amount),
        direction,
      };
    },
  },
  supplier: {
    needsEntity: true,
    amountLabel: 'Amount',
    balanceLabel: 'Payable',
    kpiDebitLabel: 'Purchases',
    kpiCreditLabel: 'Payments',
    emptyText: 'No transactions for this supplier in the selected range.',
    caption: 'Debit = purchase / adjustment · Credit = payment. Closing balance = amount payable.',
    balanceTone: (net) => (net > 0 ? 'warning' : 'success'),
    resolve: (tx) => {
      const type = tx.transactionType;
      const direction: 'debit' | 'credit' = type === 'Purchase' || type === 'Adjustment' ? 'debit' : 'credit';
      return {
        id: tx.id,
        date: tx.businessDate || tx.createdAt,
        dateLabel: fmtDate(tx.businessDate || tx.createdAt),
        type,
        typeColor: type === 'Purchase' ? 'var(--brand-warning)' : 'var(--state-success-fg)',
        notes: tx.notes,
        amount: Number(tx.amount),
        direction,
      };
    },
  },
  cash: {
    needsEntity: false,
    moneyAccount: 'Cash',
    amountLabel: 'Amount',
    balanceLabel: 'Balance',
    kpiDebitLabel: 'Received',
    kpiCreditLabel: 'Paid Out',
    emptyText: 'No cash movements in the selected range.',
    caption: 'Recorded cash receipts & payments only — fuel/drawer reconciliation lives in the DSSR. Balance is period-relative.',
    balanceTone: (net) => (net < 0 ? 'danger' : 'default'),
    resolve: (tx) => moneyResolve(tx),
  },
  bank: {
    needsEntity: false,
    moneyAccount: 'Bank',
    amountLabel: 'Amount',
    balanceLabel: 'Balance',
    kpiDebitLabel: 'Received',
    kpiCreditLabel: 'Paid Out',
    emptyText: 'No bank movements in the selected range.',
    caption: 'Recorded bank/card/UPI receipts & payments. Balance is period-relative (no opening balance yet).',
    balanceTone: (net) => (net < 0 ? 'danger' : 'default'),
    resolve: (tx) => moneyResolve(tx),
  },
  owner: {
    needsEntity: false,
    moneyAccount: 'Owner',
    amountLabel: 'Amount',
    balanceLabel: 'Owner Funding',
    kpiDebitLabel: 'Owner Funded',
    kpiCreditLabel: 'Repaid / Drawn',
    emptyText: 'No owner-funded movements in the selected range.',
    caption: 'Expenses & supplier payments funded from the owner\u2019s pocket. Balance = net amount the business owes the owner.',
    balanceTone: (net) => (net > 0 ? 'warning' : 'default'),
    resolve: (tx) => {
      // Owner-funded outflow raises what the business owes the owner (debit).
      const r = moneyResolve(tx);
      return { ...r, direction: tx.direction === 'in' ? 'credit' : 'debit' } as LedgerResolved;
    },
  },
};

// Shared resolver for money-movement rows (Cash/Bank): in raises the balance.
function moneyResolve(m: any): LedgerResolved {
  return {
    id: m.id,
    date: m.date || m.createdAt,
    dateLabel: fmtDate(m.date || m.createdAt),
    type: m.source,
    typeColor: m.direction === 'in' ? 'var(--state-success-fg)' : undefined,
    notes: m.label,
    amount: Number(m.amount),
    direction: m.direction === 'in' ? 'debit' : 'credit',
  };
}

interface Committed {
  type: EntityType;
  entityId: string;
  entityLabel: string;
  from: string;
  to: string;
}

/**
 * Entity-aware Ledger (Phase L6). Pick an entity type (Customer, Supplier,
 * Cash, Bank, Owner), the specific entity + period, then Submit to fetch — the
 * data query only fires on submit, so browsing the form never hits the backend.
 * All types render through the one generic <LedgerView>; new entities plug in
 * via the REGISTRY above.
 */
export const UnifiedLedger: React.FC<UnifiedLedgerProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };

  // Draft form state (does NOT trigger any fetch).
  const [type, setType] = useState<EntityType>('customer');
  const [entityId, setEntityId] = useState('');
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  // Committed query — only set on submit.
  const [committed, setCommitted] = useState<Committed | null>(null);

  const cfg = REGISTRY[type];

  // Picker options — only load the list the current type needs.
  const { data: customers } = useCustomers(true, { enabled: type === 'customer' } as any);
  const { data: suppliers } = useSuppliers(true, { enabled: type === 'supplier' } as any);

  const entityOptions = useMemo(() => {
    const list = type === 'customer' ? customers : type === 'supplier' ? suppliers : [];
    return (list || []).map((e: any) => ({
      value: e.id,
      label: e.name,
      sublabel: e.currentBalance != null ? `Balance ${inr(e.currentBalance)}` : undefined,
    }));
  }, [type, customers, suppliers]);

  // Ledger data hooks — enabled ONLY when the committed type matches.
  const customerLedger = useCustomerLedger(committed?.type === 'customer' ? committed.entityId : undefined);
  const supplierLedger = useSupplierLedger(committed?.type === 'supplier' ? committed.entityId : undefined);
  const isMoneyCommitted = !!committed && REGISTRY[committed.type].moneyAccount != null;
  const money = useMoneyMovements({
    stationId: isMoneyCommitted ? selectedStation?.id : undefined,
    from: committed?.from,
    to: committed?.to,
  });

  const resolvedCfg = committed ? REGISTRY[committed.type] : cfg;

  // Raw entries for the committed type (money rows filtered by account + date; the
  // party ledgers come pre-filtered by id, then clamped to the committed range).
  const { entries, loading, error } = useMemo(() => {
    if (!committed) return { entries: [] as any[], loading: false, error: null as string | null };
    if (committed.type === 'customer') {
      return {
        entries: clampByDate(customerLedger.data || [], committed.from, committed.to),
        loading: customerLedger.isLoading,
        error: customerLedger.error ? 'Failed to load ledger.' : null,
      };
    }
    if (committed.type === 'supplier') {
      return {
        entries: clampByDate(supplierLedger.data || [], committed.from, committed.to),
        loading: supplierLedger.isLoading,
        error: supplierLedger.error ? 'Failed to load ledger.' : null,
      };
    }
    const account = REGISTRY[committed.type].moneyAccount;
    return {
      entries: (money.data || []).filter((m: any) => m.account === account),
      loading: money.isLoading,
      error: money.error ? 'Failed to load movements.' : null,
    };
  }, [committed, customerLedger.data, customerLedger.isLoading, customerLedger.error, supplierLedger.data, supplierLedger.isLoading, supplierLedger.error, money.data, money.isLoading, money.error]);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const tx of entries) {
      const r = resolvedCfg.resolve(tx);
      if (r.direction === 'debit') debit += r.amount;
      else credit += r.amount;
    }
    return { debit, credit, net: debit - credit };
  }, [entries, resolvedCfg]);

  const needsEntity = cfg.needsEntity;
  const canSubmit = (!needsEntity || !!entityId) && !!range.from && !!range.to && (!!selectedStation || needsEntity);

  const submit = () => {
    if (!canSubmit) return;
    const label = needsEntity ? entityOptions.find((o) => o.value === entityId)?.label || '' : '';
    setCommitted({ type, entityId, entityLabel: label, from: range.from, to: range.to });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Query bar */}
      <div className="card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          <label className="field-label">Ledger</label>
          <Combobox
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => {
              setType(v as EntityType);
              setEntityId('');
            }}
            placeholder="Select ledger…"
          />
        </div>

        {needsEntity && (
          <div style={{ minWidth: 240, flex: 1, maxWidth: 320 }}>
            <label className="field-label">{type === 'customer' ? 'Customer' : 'Supplier'}</label>
            <Combobox
              options={entityOptions}
              value={entityId}
              onChange={setEntityId}
              placeholder={`Select ${type}…`}
              emptyMessage={`No ${type}s found`}
            />
          </div>
        )}

        <DateRangeField value={range} onChange={setRange} clock={clock} />

        <button className="btn btn-primary btn-sm" onClick={submit} disabled={!canSubmit} style={{ height: '32px' }}>
          View Ledger
        </button>
      </div>

      {!committed ? (
        <div style={{ padding: '32px', border: '1px dashed var(--border-soft)', borderRadius: 'var(--radius-card)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Pick an entity and period, then <strong>View Ledger</strong> to load the statement.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
              {committed.entityLabel || labelForType(committed.type)}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {fmtDate(committed.from)} — {fmtDate(committed.to)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <KpiCard label={resolvedCfg.kpiDebitLabel} value={inr(totals.debit)} tone="default" />
            <KpiCard label={resolvedCfg.kpiCreditLabel} value={inr(totals.credit)} tone="default" />
            <KpiCard label={resolvedCfg.balanceLabel} value={inr(totals.net)} tone={resolvedCfg.balanceTone(totals.net)} />
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{resolvedCfg.caption}</div>

          <LedgerView
            entries={entries}
            resolve={resolvedCfg.resolve}
            amountLabel={resolvedCfg.amountLabel}
            balanceLabel={resolvedCfg.balanceLabel}
            loading={loading}
            error={error}
            emptyText={resolvedCfg.emptyText}
          />
        </>
      )}
    </div>
  );
};

function labelForType(t: EntityType): string {
  return t === 'cash' ? 'Cash Ledger' : t === 'bank' ? 'Bank Ledger' : t === 'owner' ? 'Owner Ledger' : '';
}

// Clamp party-ledger rows (which come for all-time) to the committed date range.
function clampByDate(list: any[], from: string, to: string): any[] {
  return list.filter((tx) => {
    const d = (tx.businessDate || '').slice(0, 10);
    if (!d) return true;
    return d >= from && d <= to;
  });
}
