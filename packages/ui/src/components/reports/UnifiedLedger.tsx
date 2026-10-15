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
  buildLedgerStatement,
  moneyEntries,
  partyEntries,
  placeDate,
  statementDate,
  statementDocProps,
  type LedgerStatementEntry,
  type StatementKind,
} from '../../statement/index.js';
import { Combobox } from '../primitives/Combobox.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { useRunTask } from '../../utils/runTask.js';
import { formatDateSpan, formatMoney } from '../../utils/format.js';
import { paperFromStation } from '../../services/reports/reportConfig.js';
import { ledgerFileName } from '../../services/reports/ledgerFileName.js';
import { closingNote } from '../../services/reports/partyStatement.js';
import {
  KpiStrip,
  KpiTile,
  DataSection,
  EmptyState,
  ExportMenu,
  Icon,
  SectionHeader,
  computeRange,
  type DateRange,
} from '../../pump-ds/index.js';

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

interface LedgerSource {
  /** Requires picking a specific entity (customer/supplier). */
  needsEntity: boolean;
  /** Where the ledger rows come from for this type. */
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
  entries: (rows: any[]) => LedgerStatementEntry[];
  /** The closing balance is a problem below zero (cash or bank overdrawn). */
  alertBelowZero: boolean;
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
    kpiRaises: 'Credit sales',
    kpiLowers: 'Collections',
    emptyText: 'No transactions for this customer in the selected range.',
    caption:
      'Debit = credit sale / adjustment · Credit = collection. Closing balance = amount receivable.',
    alertBelowZero: false,
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
    alertBelowZero: false,
    entries: (rows) => partyEntries(rows, 'supplier'),
  },
  cash: {
    needsEntity: false,
    moneyAccount: 'Cash',
    kind: 'account',
    balanceLabel: 'Balance',
    kpiRaises: 'Received',
    kpiLowers: 'Paid out',
    emptyText: 'No cash movements in the selected range.',
    caption:
      'Debit = received · Credit = paid out. Recorded cash receipts & payments only — fuel/drawer reconciliation lives in the DSR. Opening balance is carried from before the range.',
    alertBelowZero: true,
    entries: (rows) => moneyEntries(rows),
  },
  bank: {
    needsEntity: false,
    moneyAccount: 'Bank',
    kind: 'account',
    balanceLabel: 'Balance',
    kpiRaises: 'Received',
    kpiLowers: 'Paid out',
    emptyText: 'No bank movements in the selected range.',
    caption:
      'Debit = received · Credit = paid out. Recorded bank/card/UPI receipts & payments. Opening balance is carried from before the range.',
    alertBelowZero: true,
    entries: (rows) => moneyEntries(rows),
  },
  owner: {
    needsEntity: false,
    moneyAccount: 'Owner',
    kind: 'owner',
    balanceLabel: 'Owner funding',
    kpiRaises: 'Owner funded',
    kpiLowers: 'Repaid / drawn',
    emptyText: 'No owner-funded movements in the selected range.',
    caption:
      'Credit = paid from the owner\u2019s pocket · Debit = repaid / drawn. Balance = net amount the business owes the owner.',
    alertBelowZero: false,
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
 * Cash, Bank, Owner), the specific entity and a period: the statement loads as
 * soon as the choice is complete (#567), with no Apply step. Only the list and
 * ledger the chosen type needs are fetched. All types render through the
 * Statement module (screen and PDF); new entities plug in via the REGISTRY above.
 */
export const UnifiedLedger: React.FC<UnifiedLedgerProps> = ({ selectedStation }) => {
  const s = selectedStation?.settings || {};
  const timeZone: string | undefined = s.timezone;
  const dayStartsAt: string | undefined = s.business_day_starts_at;
  const clock = { timeZone, dayStartsAt };

  const [type, setType] = useState<EntityType>('customer');
  const [entityId, setEntityId] = useState('');
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  const cfg = REGISTRY[type];

  // Picker options — only load the list the current type needs.
  const { data: customers } = useCustomers(true, { enabled: type === 'customer' } as any);
  const { data: suppliers } = useSuppliers(true, { enabled: type === 'supplier' } as any);

  const entityOptions = useMemo(() => {
    const list = type === 'customer' ? customers : type === 'supplier' ? suppliers : [];
    return (list || []).map((e: any) => ({
      value: e.id,
      label: e.name,
      sublabel: e.currentBalance != null ? `Balance ${formatMoney(e.currentBalance)}` : undefined,
    }));
  }, [type, customers, suppliers]);

  // The ledger on screen: set once the choice is complete (an entity picked
  // when the type needs one, and a station for the money accounts).
  const needsEntity = cfg.needsEntity;
  const committed = useMemo<Committed | null>(() => {
    const complete = (needsEntity ? !!entityId : !!selectedStation) && !!range.from && !!range.to;
    if (!complete) return null;
    const label = needsEntity ? entityOptions.find((o) => o.value === entityId)?.label || '' : '';
    return { type, entityId, entityLabel: label, from: range.from, to: range.to };
  }, [needsEntity, entityId, selectedStation, range.from, range.to, entityOptions, type]);

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
    //
    // A row's date is the one the statement prints it under: its business day
    // or entry date on the station clock (ADR 0005), never the UTC slice of
    // `businessDate`, which put an evening IST row on the wrong day (#568).
    const dateOf = (tx: any) => {
      const [entry] = toEntries([tx]);
      return entry ? placeDate(entry, { timeZone, dayStartsAt }) : '';
    };
    const partyOpening = (all: any[]) =>
      toEntries(
        (all || []).filter((tx) => {
          const d = dateOf(tx);
          return !!d && d < committed.from;
        }),
      ).reduce((acc, e) => acc + e.amount, 0);
    if (committed.type === 'customer') {
      return {
        entries: clampByDate(customerLedger.data || [], committed, dateOf),
        openingBalance: partyOpening(customerLedger.data || []),
        loading: customerLedger.isLoading,
      };
    }
    if (committed.type === 'supplier') {
      return {
        entries: clampByDate(supplierLedger.data || [], committed, dateOf),
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
    timeZone,
    dayStartsAt,
  ]);

  const ledgerQuery =
    committed?.type === 'customer'
      ? customerLedger
      : committed?.type === 'supplier'
        ? supplierLedger
        : money;

  const statement = useMemo(
    () =>
      buildLedgerStatement(resolvedCfg.entries(entries), {
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

  const runTask = useRunTask();
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
      const party =
        committed.type === 'customer' || committed.type === 'supplier' ? committed.type : null;
      const entityName =
        committed.entityLabel || labelForType(committed.type) || TYPE_LABEL[committed.type];
      const element = React.createElement(LedgerDoc, {
        title: `${TYPE_LABEL[committed.type].toUpperCase()} LEDGER`,
        entityName,
        periodLabel: `${statementDate(committed.from)} — ${statementDate(committed.to)}`,
        // The same lines the screen prints (Statement module). A party's balance
        // below zero is an advance, worded as on the party statement, not a shortfall.
        ...statementDocProps(statement, party ? closingNote(party, statement.closing) : undefined),
        partyAccount: !!party,
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

  const heading = committed ? committed.entityLabel || labelForType(committed.type) : '';

  return (
    <div className="flex flex-col gap-4">
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        filters={
          <>
            <div className="w-[160px]">
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
              <div className="w-[260px]">
                <Combobox
                  options={entityOptions}
                  value={entityId}
                  onChange={setEntityId}
                  placeholder={`Select ${type}…`}
                  emptyMessage={`No ${type}s found`}
                />
              </div>
            )}
          </>
        }
        exportMenu={
          <ExportMenu
            onPdf={() => runTask(downloadPdf(), 'Could not export the ledger.')}
            disabled={!committed || loading || downloading || statement.rows.length === 0}
          />
        }
        info={
          <InfoTip label="About this ledger" placement="bottom">
            {resolvedCfg.caption}
          </InfoTip>
        }
      />

      {!committed ? (
        <EmptyState
          compact
          icon={<Icon name="ledger" size="md" />}
          title="Select a ledger"
          description="Pick a customer or supplier to load the statement."
        />
      ) : (
        <>
          <DataSection
            title={`${heading} totals`}
            query={ledgerQuery}
            enabled
            shape="cards"
            placeholderHeight={90}
          >
            <KpiStrip columns="auto">
              <KpiTile
                label={resolvedCfg.kpiRaises}
                scope="in-range"
                value={formatMoney(totals.raises)}
              />
              <KpiTile
                label={resolvedCfg.kpiLowers}
                scope="in-range"
                value={formatMoney(totals.lowers)}
              />
              <KpiTile
                alert={resolvedCfg.alertBelowZero && totals.net < 0 ? 'danger' : undefined}
                label={resolvedCfg.balanceLabel}
                scope="in-range"
                value={formatMoney(totals.net)}
                hint="at the end of the range"
              />
            </KpiStrip>
          </DataSection>

          <section className="flex flex-col gap-2">
            <SectionHeader
              title={heading}
              subtitle={formatDateSpan(committed.from, committed.to)}
            />
            <DataSection
              title="ledger"
              query={ledgerQuery}
              enabled
              placeholderHeight={240}
              shape="bare"
            >
              <StatementView
                statement={statement}
                label={`${heading} statement`}
                emptyMessage={resolvedCfg.emptyText}
              />
            </DataSection>
          </section>
        </>
      )}
    </div>
  );
};

function labelForType(t: EntityType): string {
  return t === 'cash'
    ? 'Cash ledger'
    : t === 'bank'
      ? 'Bank ledger'
      : t === 'owner'
        ? 'Owner ledger'
        : '';
}

/**
 * Clamp party-ledger rows (which come for all-time) to the committed range, by
 * the date each row is printed under. A row with no date stays in.
 */
function clampByDate(
  list: any[],
  range: { from: string; to: string },
  dateOf: (tx: any) => string,
): any[] {
  return list.filter((tx) => {
    const d = dateOf(tx);
    if (!d) return true;
    return d >= range.from && d <= range.to;
  });
}
