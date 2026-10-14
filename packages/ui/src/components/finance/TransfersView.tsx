import React, { useMemo, useState } from 'react';
import {
  DataSection,
  DateRangeMenu,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  computeRange,
  type DateRange,
  type KpiScope,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { useFinanceMovements } from '../../query/hooks.js';
import { formatMoney } from '../../utils/format.js';
import { InfoTip } from '../primitives/InfoTip.js';
import {
  entries,
  inWindow,
  pairTransfers,
  plural,
  sumTransfers,
  type MovementRow,
  type Transfer,
  type TransferKind,
} from './accountsModel.js';

type KindFilter = 'all' | TransferKind;

const KIND_LABEL: Record<TransferKind, string> = { deposit: 'Deposit', transfer: 'Transfer' };

/** What a filtered total leaves out. */
const TOTAL_LABEL: Record<KindFilter, string> = {
  all: 'Total',
  deposit: 'Total excl. transfers',
  transfer: 'Total excl. deposits',
};

const AccountName: React.FC<{ name: string | null }> = ({ name }) =>
  name ? (
    <span className="text-ink-strong">{name}</span>
  ) : (
    <span className="text-ink-faint">—</span>
  );

const COLUMNS: TableColumn<Transfer>[] = [
  { id: 'entryDate', header: 'Entry date', kind: 'date', value: (t) => t.entryDate, width: '14%' },
  { id: 'kind', header: 'Kind', kind: 'text', value: (t) => KIND_LABEL[t.kind], width: '11%' },
  {
    id: 'from',
    header: 'From',
    kind: 'text',
    value: (t) => t.fromName,
    cell: (t) => <AccountName name={t.fromName} />,
    width: '18%',
  },
  {
    id: 'to',
    header: 'To',
    kind: 'text',
    value: (t) => t.toName,
    cell: (t) => <AccountName name={t.toName} />,
    width: '18%',
  },
  {
    id: 'notes',
    header: 'Notes',
    kind: 'text',
    value: (t) => t.notes,
    cell: (t) => <span className="text-ink-muted">{t.notes || '—'}</span>,
  },
  { id: 'amount', header: 'Amount', kind: 'money', value: (t) => t.amount, width: '16%' },
];

export interface TransfersViewProps {
  selectedStation: { id?: string; settings?: { timezone?: string } } | null;
}

/**
 * Accounts › Transfers (#530), layout B: money moved between the station's own
 * accounts (deposits of office cash into a bank, and every other transfer).
 * Tiles read fixed windows (this month, today); the range and the kind filter
 * sit in the list's section header.
 */
export const TransfersView: React.FC<TransfersViewProps> = ({ selectedStation }) => {
  const stationId = selectedStation?.id ?? null;
  const timeZone = selectedStation?.settings?.timezone;
  // Transfers are office records, dated by entry date (ADR 0005).
  const entryClock = useMemo(() => ({ timeZone }), [timeZone]);
  const month = useMemo(() => computeRange('this-month', entryClock), [entryClock]);
  const today = useMemo(() => computeRange('today', entryClock), [entryClock]);
  const [range, setRange] = useState<DateRange>(month);
  const [kind, setKind] = useState<KindFilter>('all');

  const listQ = useFinanceMovements({ stationId, from: range.from, to: range.to });
  // The month the tiles read. Same key as the list at its default period, so one request.
  const monthQ = useFinanceMovements({ stationId, from: month.from, to: month.to });

  const inRange = useMemo(
    () => pairTransfers((listQ.data?.movements ?? []) as MovementRow[]),
    [listQ.data],
  );
  const rows = useMemo(
    () => (kind === 'all' ? inRange : inRange.filter((t) => t.kind === kind)),
    [inRange, kind],
  );
  const totalRow = useMemo<TotalRow>(() => ({ label: TOTAL_LABEL[kind] }), [kind]);

  const tiles = useMemo(() => {
    const monthRows = pairTransfers((monthQ.data?.movements ?? []) as MovementRow[]);
    const deposits = monthRows.filter((t) => t.kind === 'deposit');
    const others = monthRows.filter((t) => t.kind === 'transfer');
    const todayRows = monthRows.filter((t) => inWindow(t.entryDate, today));
    return { deposits, others, todayRows };
  }, [monthQ.data, today]);
  const monthScope: KpiScope = { month: month.from };

  const count = (k: TransferKind) => inRange.filter((t) => t.kind === k).length;

  return (
    <div className="flex flex-col gap-4">
      <DataSection title="transfer totals" query={monthQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile
            label="Deposited to bank"
            scope={monthScope}
            value={formatMoney(sumTransfers(tiles.deposits))}
            hint={plural(tiles.deposits.length, 'deposit')}
          />
          <KpiTile
            label="Other transfers"
            scope={monthScope}
            value={formatMoney(sumTransfers(tiles.others))}
            hint={plural(tiles.others.length, 'transfer')}
          />
          <KpiTile
            label="Moved today"
            scope="today"
            value={formatMoney(sumTransfers(tiles.todayRows))}
            hint={plural(tiles.todayRows.length, 'move')}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Transfers"
          subtitle={listQ.data ? entries(rows.length) : undefined}
          controls={{
            range: (
              <DateRangeMenu
                value={range}
                onChange={setRange}
                clock={entryClock}
                align="end"
                aria-label="Transfers period"
              />
            ),
            filters: (
              <FilterChips<KindFilter>
                aria-label="Kind of transfer"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'all', label: 'All', count: inRange.length },
                  { value: 'deposit', label: 'Deposits', count: count('deposit') },
                  { value: 'transfer', label: 'Transfers', count: count('transfer') },
                ]}
              />
            ),
            info: (
              <InfoTip label="About transfers" placement="bottom">
                Money moved between the station&apos;s own accounts. A deposit takes office cash
                (Cash in Hand or Petty Cash) into a bank; every other move is a transfer. Each one
                is an office record, dated by its entry date.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="transfers"
          query={listQ}
          placeholderHeight={240}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="arrow-left-right" size="md" />}
                title={inRange.length === 0 ? 'No transfers in this period' : 'No matches'}
                description={
                  inRange.length === 0
                    ? 'Record one with “New transfer”, or pick another period.'
                    : 'Choose another kind or period.'
                }
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={COLUMNS}
            rows={rows}
            rowKey={(t) => t.id}
            totalRow={totalRow}
            title="transfers"
          />
        </DataSection>
      </section>
    </div>
  );
};
