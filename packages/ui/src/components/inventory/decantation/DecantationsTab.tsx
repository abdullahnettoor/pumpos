import React, { useMemo, useState } from 'react';
import { resolveDecantationSettings, type DecantationView } from '@pump/shared';
import {
  Button,
  Chip,
  DataSection,
  DateRangeMenu,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  SectionHeader,
  StatusChip,
  computeRange,
  type ChipTone,
  type DateRange,
  type FilterChipOption,
  type PumpStatus,
  type RangeClock,
  type TableColumn,
  type TotalRow,
} from '../../../pump-ds/index.js';
import { Banner } from '../../primitives/Banner.js';
import { InfoTip } from '../../primitives/InfoTip.js';
import { useDecantations, useInventoryStatus } from '../../../query/hooks.js';
import { DecantationDrawer } from './DecantationDrawer.js';
import { LinkPurchaseDrawer } from './LinkPurchaseDrawer.js';
import { toDecantationRow, type DecantationRow } from './decantationRows.js';
import { formatDensity, formatQuantity, formatDate } from '../../../utils/format.js';
import { countOf, inWindow } from '../../../utils/ledgerWindow.js';

type Filter = 'all' | 'flagged' | 'pending' | 'unlinked';

export interface DecantationsTabProps {
  station: { id: string; settings?: unknown } | null;
  userRole?: string | null;
  /** The station clock: a Decantation sits on a Business Day. */
  clock?: RangeClock;
}

/** A Decantation's lifecycle in the status vocabulary (#518, #536). */
const STATUS: Record<DecantationView['status'], PumpStatus> = {
  DRAFT: 'decantation-draft',
  PENDING_MEASUREMENT: 'pending-measurement',
  MEASURED: 'measured',
  DISCARDED: 'discarded',
};

const FLAG_LABEL: Record<string, string> = {
  DENSITY_OUT_OF_TOLERANCE: 'Density off',
  TANKER_SHORT: 'Tanker short',
  CHAMBER_NOT_EMPTIED: 'Chamber not emptied',
  EARLY_AFTER_DIP: 'Early after dip',
};

const FILTERS: Record<
  Filter,
  { label: string; test: (r: DecantationRow) => boolean; status?: PumpStatus }
> = {
  all: { label: 'All', test: () => true },
  flagged: { label: 'Flagged', test: (r) => r.decantation.flags.length > 0, status: 'variance' },
  pending: {
    label: 'Pending',
    test: (r) => r.decantation.status !== 'MEASURED',
    status: 'pending-measurement',
  },
  unlinked: {
    label: 'Not linked',
    test: (r) => r.unlinked.length > 0,
    status: 'purchase-not-linked',
  },
};

/** Within the station's quantity tolerance a difference is neutral; beyond it, a problem. */
const varianceTone = (v: DecantationRow['variances'][number]): ChipTone =>
  v.kind === 'OK'
    ? 'success'
    : !v.outOfTolerance
      ? 'neutral'
      : v.kind === 'SHORT'
        ? 'danger'
        : 'warning';

const dateOf = (r: DecantationRow) => r.decantation.businessDate ?? r.decantation.createdAt;

/** A visit still being worked on shows whatever the range: open work never hides. */
const isOpen = (r: DecantationRow) =>
  r.decantation.status === 'DRAFT' || r.decantation.status === 'PENDING_MEASUREMENT';

const visits = (n: number) => countOf(n, 'visit', 'visits');

const Muted: React.FC = () => <span className="text-ink-faint">—</span>;

const Stack: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col items-start gap-1">{children}</div>
);

/**
 * Inventory → Decantations: the tanker-visit ledger (layout B, #567), one row
 * per visit with its tank lines grouped (ADR 0007). Range, row filter and
 * "New decantation" sit in the ledger's header; statuses are the shared
 * vocabulary. A row still open reopens in the drawer.
 */
export const DecantationsTab: React.FC<DecantationsTabProps> = ({ station, userRole, clock }) => {
  const stationId = station?.id ?? null;
  const settings = useMemo(
    () => resolveDecantationSettings(station?.settings),
    [station?.settings],
  );
  const decantationsQ = useDecantations(stationId);
  const tanksQ = useInventoryStatus(stationId);
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [filter, setFilter] = useState<Filter>('all');
  const [drawer, setDrawer] = useState<{ decantation: DecantationView | null } | null>(null);
  const [linking, setLinking] = useState<DecantationView | null>(null);

  const names = useMemo(() => {
    const tanks: Record<string, string> = {};
    const products: Record<string, string> = {};
    for (const t of tanksQ.data ?? []) {
      tanks[t.id] = t.name;
      products[t.productId] = t.productName ?? t.productCode ?? 'Fuel';
    }
    return { tanks, products };
  }, [tanksQ.data]);

  const all = useMemo(
    () =>
      (decantationsQ.data ?? []).map((d) => toDecantationRow(d, names, settings.quantityTolerance)),
    [decantationsQ.data, names, settings.quantityTolerance],
  );
  const flagged = useMemo(() => all.filter(FILTERS.flagged.test).length, [all]);
  const inRange = useMemo(
    () =>
      all
        .filter((r) => isOpen(r) || inWindow(dateOf(r).slice(0, 10), range))
        .sort((a, b) => dateOf(b).localeCompare(dateOf(a))),
    [all, range],
  );
  const options = useMemo<FilterChipOption<Filter>[]>(
    () =>
      (Object.keys(FILTERS) as Filter[]).map((value) => ({
        value,
        label: FILTERS[value].label,
        count: inRange.filter(FILTERS[value].test).length,
        ...(FILTERS[value].status ? { status: FILTERS[value].status } : {}),
      })),
    [inRange],
  );
  const rows = useMemo(() => inRange.filter(FILTERS[filter].test), [inRange, filter]);
  const totalRow = useMemo<TotalRow>(() => ({ label: 'Total excl. pending' }), []);

  const columns = useMemo<TableColumn<DecantationRow>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        kind: 'date',
        value: dateOf,
        width: '11%',
        cell: (r) => (
          <div className="flex flex-col gap-0.5">
            <span>{formatDate(dateOf(r))}</span>
            <span className="font-mono text-[12px] text-ink-muted">
              {r.decantation.documentNumber}
            </span>
          </div>
        ),
      },
      {
        id: 'tanker',
        header: 'Tanker',
        kind: 'text',
        value: (r) => r.decantation.tankerNumber,
        width: '11%',
        cell: (r) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-ink">{r.decantation.tankerNumber}</span>
            {r.decantation.driverName && (
              <span className="text-[12px] text-ink-muted">{r.decantation.driverName}</span>
            )}
          </div>
        ),
      },
      {
        id: 'tanks',
        header: 'Tanks',
        kind: 'text',
        value: (r) => r.tanks.map((t) => t.tankName).join(', '),
        sortable: false,
        cell: (r) => (
          <div className="flex flex-col gap-0.5 text-[12px]">
            {r.tanks.map((t) => (
              <span key={t.lineId} className="whitespace-nowrap">
                {t.tankName}
                <span className="text-ink-muted">
                  {' '}
                  · {t.productName}
                  {t.status === 'MEASURED' && t.receivedQty != null
                    ? ` · ${formatQuantity(t.receivedQty, 'L')}`
                    : ''}
                </span>
              </span>
            ))}
          </div>
        ),
      },
      {
        id: 'invoiceQty',
        header: 'Invoice qty',
        kind: 'qty',
        value: (r) => r.invoiceQty,
        unit: 'L',
        width: '10%',
        cell: (r) => (r.invoiceQty != null ? formatQuantity(r.invoiceQty, 'L') : <Muted />),
      },
      {
        id: 'received',
        header: 'Received',
        kind: 'qty',
        value: (r) => r.receivedQty,
        unit: 'L',
        width: '10%',
        cell: (r) => (r.receivedQty != null ? formatQuantity(r.receivedQty, 'L') : <Muted />),
      },
      {
        id: 'variance',
        header: 'Excess / short',
        kind: 'text',
        value: (r) => r.variances.length,
        sortable: false,
        cell: (r) =>
          r.variances.length === 0 ? (
            <Muted />
          ) : (
            <Stack>
              {r.variances.map((v) => (
                <Chip key={v.productName} size="md" tone={varianceTone(v)}>
                  {v.kind === 'OK'
                    ? `${v.productName} · Matches`
                    : `${v.productName} · ${v.kind === 'SHORT' ? 'Short' : 'Excess'} ${formatQuantity(v.qty, 'L')}`}
                </Chip>
              ))}
            </Stack>
          ),
      },
      {
        id: 'density',
        header: 'Density',
        kind: 'text',
        value: (r) => r.density.length,
        sortable: false,
        cell: (r) =>
          r.density.length === 0 ? (
            <Muted />
          ) : (
            <Stack>
              {r.density.map((d) => (
                <Chip
                  key={d.productName}
                  size="md"
                  tone={d.outOfTolerance ? 'danger' : 'neutral'}
                  className="tabular-nums"
                >
                  {d.productName} · {formatDensity(d.diff, { plus: true })} kg/m³
                </Chip>
              ))}
            </Stack>
          ),
      },
      {
        id: 'flags',
        header: 'Flags',
        kind: 'text',
        value: (r) => r.decantation.flags.length,
        sortable: false,
        cell: (r) =>
          r.decantation.flags.length === 0 ? (
            <Muted />
          ) : (
            <Stack>
              {r.decantation.flags.map((f, i) => (
                <Chip
                  key={i}
                  size="md"
                  tone="danger"
                  title={f.message}
                  icon={<Icon name="alert-triangle" size="xs" />}
                >
                  {FLAG_LABEL[f.code] ?? f.code}
                </Chip>
              ))}
            </Stack>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        kind: 'text',
        value: (r) => r.decantation.status,
        width: '15%',
        cell: (r) => (
          <Stack>
            <StatusChip status={STATUS[r.decantation.status]} size="md" />
            {r.unlinked.map((p) => (
              <span key={p} className="inline-flex items-center gap-1">
                <StatusChip
                  status="purchase-not-linked"
                  size="md"
                  label={`Not linked · ${p}`}
                  showIcon={false}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Link purchase for ${p}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLinking(r.decantation);
                  }}
                >
                  Link ›
                </Button>
              </span>
            ))}
          </Stack>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        {userRole === 'Owner' && flagged > 0 && (
          <Banner severity="danger" title="Needs your review">
            {flagged} flagged Decantation{flagged === 1 ? '' : 's'}: density off, tanker short or
            chamber not emptied.
          </Banner>
        )}
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Decantations"
            subtitle={decantationsQ.data ? visits(rows.length) : undefined}
            controls={{
              range: (
                <DateRangeMenu
                  value={range}
                  onChange={setRange}
                  clock={clock}
                  align="end"
                  aria-label="Decantations period"
                />
              ),
              filters: decantationsQ.data && (
                <FilterChips
                  aria-label="Decantation filter"
                  options={options}
                  value={filter}
                  onChange={setFilter}
                />
              ),
              actions: (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Icon name="plus" size="sm" />}
                  onClick={() => setDrawer({ decantation: null })}
                >
                  New decantation
                </Button>
              ),
              info: (
                <InfoTip label="About decantations" placement="bottom">
                  One row per tanker visit. Received is measured at the next tank dip, so it shows
                  once every tank line is measured; the total leaves pending visits and unlinked
                  invoices out. A visit still open shows whatever the range. Excess or short within
                  the station&rsquo;s tolerance reads grey.
                </InfoTip>
              ),
            }}
          />
          <DataSection
            title="decantations"
            query={decantationsQ}
            placeholderHeight={240}
            flush
            isEmpty={rows.length === 0}
            empty={
              <div className="p-3">
                <EmptyState
                  compact
                  icon={<Icon name="truck" size="md" />}
                  title={all.length === 0 ? 'No decantations yet' : 'No matching decantations'}
                  description={
                    all.length === 0
                      ? 'Record each tanker unloading to measure what actually reached the tanks.'
                      : 'Adjust the range or the filter.'
                  }
                />
              </div>
            }
          >
            <InteractiveTable
              bare
              columns={columns}
              rows={rows}
              rowKey={(r) => r.decantation.id}
              totalRow={totalRow}
              title="decantations"
              rowLabel={(r) => `Decantation ${r.decantation.documentNumber}`}
              onRowClick={(r) => {
                // A measured visit has posted stock and is sealed; the others reopen in the drawer.
                if (r.decantation.status !== 'MEASURED') setDrawer({ decantation: r.decantation });
              }}
            />
          </DataSection>
        </section>
      </div>
      <DecantationDrawer
        isOpen={!!drawer}
        onClose={() => setDrawer(null)}
        station={station}
        decantation={drawer?.decantation ?? null}
      />
      <LinkPurchaseDrawer
        stationId={stationId}
        decantation={linking}
        productNames={names.products}
        onClose={() => setLinking(null)}
      />
    </>
  );
};
