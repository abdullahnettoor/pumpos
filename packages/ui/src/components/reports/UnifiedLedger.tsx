import React, { useMemo, useState } from 'react';
import {
  useCustomers,
  useSuppliers,
  useCustomerLedger,
  useSupplierLedger,
  useMoneyMovements,
} from '../../query/hooks.js';
import {
  StatementView,
  buildStatement,
  moneyEntries,
  partyEntries,
  statementDocProps,
  type StatementEntry,
  type StatementKind,
} from '../../statement/index.js';
import { Combobox } from '../primitives/Combobox.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import { ReportNote } from './ReportNote.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr, formatDate } from '../../utils/format.js';
import { paperFromStation } from '../../services/reports/reportConfig.js';
import { ledgerFileName } from '../../services/reports/ledgerFileName.js';
import {
  KpiStrip,
  KpiTile,
  Panel,
  Button,
  DataSection,
  EmptyState,
  Icon,
} from '../../pump-ds/index.js';

/** Tone for the closing-balance KPI (kept local; the old KpiCard primitive is retired). */
type BalanceTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

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

const TYPE_LABEL: Record<EntityType, string> = {
  customer: 'Customer',
  supplier: 'Supplier',
  cash: 'Cash',
  bank: 'Bank',
  owner: 'Owner',
};

const fmtDate = (v: any) => formatDate(v, { compact: true });

interface LedgerSource {
  /** Requires picking a specific entity (customer/supplier). */
  needsEntity: boolean;
  /** Where the ledger rows come from when this type is committed. */
  moneyAccount?: 'Cash' | 'Bank' | 'Owner';
  /** The account kind: decides which column (Debit or Credit) raises the balance. */
  kind: StatementKind;
  balanceLabel: string;
  /** KPI labels: the entries that raise the balance, and those that lower it. */
  kpiRaises: string;
  kpiLowers: string;
  emptyText: string;
  caption: string;
  /** The API rows as statement entries. */
  entries: (rows: any[]) => StatementEntry[];
  /** Tone of the closing-balance KPI given the net value. */
  balanceTone: (net: number) => BalanceTone;
}

/**
 * Entity-aware ledger registry. Adding a new money entity later (employee,
 * fleet, GST, a specific bank account …) = one entry here — the statement,
 * picker, running balance, KPIs and PDF are all driven from this map.
 */
const REGISTRY: Record<EntityType, LedgerSource> = {
  customer: {
    needsEntity: true,
    kind: 'customer',
    balanceLabel: MONEY_TERMS.receivable,
    kpiRaises: 'Credit Sales',
    kpiLowers: 'Collections',
    emptyText: 'No transactions for this customer in the selected range.',
    caption:
      'Debit = credit sale / adjustment · Credit = collection. Closing balance = amount receivable.',
    balanceTone: (net) => (net > 0 ? 'warning' : 'success'),
    entries: (rows) => partyEntries(rows, 'customer'),
  },
  supplier: {
    needsEntity: true,
    kind: 'supplier',
    balanceLabel: MONEY_TERMS.payable,
    kpiRaises: 'Purchases',
    kpiLowers: 'Payments',
    emptyText: 'No transactions for this supplier in the selected range.',
    caption: 'Credit = purchase / adjustment · Debit = payment. Closing balance = amount payable.',
    balanceTone: (net) => (net > 0 ? 'warning' : 'success'),
    entries: (rows) => partyEntries(rows, 'supplier'),
  },
  cash: {
    needsEntity: false,
    moneyAccount: 'Cash',
    kind: 'account',
    balanceLabel: 'Balance',
    kpiRaises: 'Received',
    kpiLowers: 'Paid Out',
    emptyText: 'No cash movements in the selected range.',
    caption:
      'Debit = received · Credit = paid out. Recorded cash receipts & payments only — fuel/drawer reconciliation lives in the DSSR. Opening balance is carried from before the range.',
    balanceTone: (net) => (net < 0 ? 'danger' : 'default'),
    entries: (rows) => moneyEntries(rows),
  },
  bank: {
    needsEntity: false,
    moneyAccount: 'Bank',
    kind: 'account',
    balanceLabel: 'Balance',
    kpiRaises: 'Received',
    kpiLowers: 'Paid Out',
    emptyText: 'No bank movements in the selected range.',
    caption:
      'Debit = received · Credit = paid out. Recorded bank/card/UPI receipts & payments. Opening balance is carried from before the range.',
    balanceTone: (net) => (net < 0 ? 'danger' : 'default'),
    entries: (rows) => moneyEntries(rows),
  },
  owner: {
    needsEntity: false,
    moneyAccount: 'Owner',
    kind: 'owner',
    balanceLabel: 'Owner Funding',
    kpiRaises: 'Owner Funded',
    kpiLowers: 'Repaid / Drawn',
    emptyText: 'No owner-funded movements in the selected range.',
    caption:
      'Credit = paid from the owner\u2019s pocket · Debit = repaid / drawn. Balance = net amount the business owes the owner.',
    balanceTone: (net) => (net > 0 ? 'warning' : 'default'),
    // Owner-funded outflow raises what the business owes the owner.
    entries: (rows) => moneyEntries(rows, { owner: true }),
  },
};

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
 * All types render through the Statement module (screen and PDF); new entities
 * plug in via the REGISTRY above.
 */
export const UnifiedLedger: React.FC<UnifiedLedgerProps> = ({ selectedStation }) => {
  const s = selectedStation?.settings || {};
  const timeZone: string | undefined = s.timezone;
  const dayStartsAt: string | undefined = s.business_day_starts_at;
  const clock = { timeZone, dayStartsAt };

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
  const customerLedger = useCustomerLedger(
    committed?.type === 'customer' ? committed.entityId : undefined,
  );
  const supplierLedger = useSupplierLedger(
    committed?.type === 'supplier' ? committed.entityId : undefined,
  );
  const isMoneyCommitted = !!committed && REGISTRY[committed.type].moneyAccount != null;
  const money = useMoneyMovements({
    stationId: isMoneyCommitted ? selectedStation?.id : undefined,
    from: committed?.from,
    to: committed?.to,
  });

  const resolvedCfg = committed ? REGISTRY[committed.type] : cfg;

  // Raw entries for the committed type (money rows filtered by account + date;
  // the party ledgers come all-time, then filtered to the committed range) plus
  // the opening balance carried from before the range so the running balance is
  // period-accurate instead of restarting at zero.
  const { entries, openingBalance, loading } = useMemo(() => {
    if (!committed)
      return {
        entries: [] as any[],
        openingBalance: 0,
        loading: false,
      };
    const toEntries = REGISTRY[committed.type].entries;
    // Opening for a party ledger = Σ signed amount over rows dated before the
    // range start, from the same entries as the running balance so they agree.
    // TODO (ledger scaling): party ledgers fetch ALL-TIME rows and we compute the
    // opening + clamp here. When histories grow large, move this to the backend
    // (from/to + periodOpeningBalance) — see the matching TODO on the
    // /customers/:id/ledger and /suppliers/:id/ledger endpoints — and delete
    // partyOpening + clampByDate.
    const partyOpening = (all: any[]) =>
      toEntries(
        (all || []).filter((tx) => (tx.businessDate || '').slice(0, 10) < committed.from),
      ).reduce((acc, e) => acc + e.amount, 0);
    if (committed.type === 'customer') {
      return {
        entries: clampByDate(customerLedger.data || [], committed.from, committed.to),
        openingBalance: partyOpening(customerLedger.data || []),
        loading: customerLedger.isLoading,
      };
    }
    if (committed.type === 'supplier') {
      return {
        entries: clampByDate(supplierLedger.data || [], committed.from, committed.to),
        openingBalance: partyOpening(supplierLedger.data || []),
        loading: supplierLedger.isLoading,
      };
    }
    const account = REGISTRY[committed.type].moneyAccount;
    // Money openings come from the backend as raw signed net (in − out). Cash/Bank
    // balances rise with money in, so that is the opening; the Owner balance rises
    // with money out (owner-funded), so its opening is negated.
    const rawOpening = Number(
      (money.data?.openings || []).find((o: any) => o.account === account)?.opening ?? 0,
    );
    return {
      entries: (money.data?.movements || []).filter((m: any) => m.account === account),
      openingBalance: committed.type === 'owner' ? -rawOpening : rawOpening,
      loading: money.isLoading,
    };
  }, [
    committed,
    customerLedger.data,
    customerLedger.isLoading,
    supplierLedger.data,
    supplierLedger.isLoading,
    money.data,
    money.isLoading,
  ]);

  const statement = useMemo(
    () =>
      buildStatement(resolvedCfg.entries(entries), {
        kind: resolvedCfg.kind,
        opening: openingBalance,
        clock: { timeZone, dayStartsAt },
      }),
    [entries, resolvedCfg, openingBalance, timeZone, dayStartsAt],
  );
  const raisesDebit = statement.normal === 'debit';
  const totals = {
    raises: raisesDebit ? statement.totals.debit : statement.totals.credit,
    lowers: raisesDebit ? statement.totals.credit : statement.totals.debit,
    net: statement.closing,
  };

  const [downloading, setDownloading] = useState(false);
  const downloadPdf = async () => {
    if (!committed || statement.rows.length === 0) return;
    setDownloading(true);
    try {
      const [{ exportReactPdf }, { LedgerDoc }, { letterheadFromStation }] = await Promise.all([
        import('../../services/exportPdf.js'),
        import('../../services/reports/ledgerDoc.js'),
        import('../../services/reports/letterhead.js'),
      ]);
      const entityName =
        committed.entityLabel || labelForType(committed.type) || TYPE_LABEL[committed.type];
      const element = React.createElement(LedgerDoc, {
        title: `${TYPE_LABEL[committed.type].toUpperCase()} LEDGER`,
        entityName,
        periodLabel: `${fmtDate(committed.from)} — ${fmtDate(committed.to)}`,
        // The same lines the screen prints (Statement module).
        ...statementDocProps(statement),
        stationName: selectedStation?.name,
        letterhead: letterheadFromStation(selectedStation),
        generatedAt: new Date().toISOString(),
        paper: paperFromStation(selectedStation),
      });
      await exportReactPdf(
        element,
        ledgerFileName('Ledger', entityName || committed.type, committed),
      );
    } finally {
      setDownloading(false);
    }
  };

  const needsEntity = cfg.needsEntity;
  const canSubmit =
    (!needsEntity || !!entityId) &&
    !!range.from &&
    !!range.to &&
    (!!selectedStation || needsEntity);

  const submit = () => {
    if (!canSubmit) return;
    const label = needsEntity ? entityOptions.find((o) => o.value === entityId)?.label || '' : '';
    setCommitted({ type, entityId, entityLabel: label, from: range.from, to: range.to });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Query bar */}
      <Panel>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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

          <DateRangeField value={range} onChange={setRange} clock={clock} size="sm" />

          <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>
            View Ledger
          </Button>
        </div>
        <ReportNote className="mt-1.5">{resolvedCfg.caption}</ReportNote>
      </Panel>

      {!committed ? (
        <EmptyState
          compact
          icon={<Icon name="ledger" size="md" />}
          title="Select a ledger"
          description="Pick an entity and period, then View Ledger to load the statement."
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                  margin: 0,
                }}
              >
                {committed.entityLabel || labelForType(committed.type)}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {fmtDate(committed.from)} — {fmtDate(committed.to)}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="download" size="sm" />}
              onClick={downloadPdf}
              loading={downloading}
              disabled={loading || statement.rows.length === 0}
            >
              Download PDF
            </Button>
          </div>

          <KpiStrip columns="auto">
            <KpiTile dot="neutral" label={resolvedCfg.kpiRaises} value={inr(totals.raises)} />
            <KpiTile dot="neutral" label={resolvedCfg.kpiLowers} value={inr(totals.lowers)} />
            {(() => {
              const bt = resolvedCfg.balanceTone(totals.net);
              return (
                <KpiTile
                  dot={bt === 'default' ? 'brand' : bt}
                  valueTone={bt === 'default' ? undefined : bt}
                  label={resolvedCfg.balanceLabel}
                  value={inr(totals.net)}
                />
              );
            })()}
          </KpiStrip>

          <DataSection
            title="ledger"
            query={
              committed.type === 'customer'
                ? customerLedger
                : committed.type === 'supplier'
                  ? supplierLedger
                  : money
            }
            enabled
            placeholderHeight={240}
            shape="bare"
          >
            <StatementView
              statement={statement}
              label={`${committed.entityLabel || labelForType(committed.type)} statement`}
              emptyMessage={resolvedCfg.emptyText}
            />
          </DataSection>
        </>
      )}
    </div>
  );
};

function labelForType(t: EntityType): string {
  return t === 'cash'
    ? 'Cash Ledger'
    : t === 'bank'
      ? 'Bank Ledger'
      : t === 'owner'
        ? 'Owner Ledger'
        : '';
}

// Clamp party-ledger rows (which come for all-time) to the committed date range.
function clampByDate(list: any[], from: string, to: string): any[] {
  return list.filter((tx) => {
    const d = (tx.businessDate || '').slice(0, 10);
    if (!d) return true;
    return d >= from && d <= to;
  });
}
