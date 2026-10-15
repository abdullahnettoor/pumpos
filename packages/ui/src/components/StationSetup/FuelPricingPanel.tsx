import React, { useMemo, useState } from 'react';
import { businessDateSettings, formatStationDateTime, type Station } from '@pump/shared';
import { PageFrame } from '../page-frame/index.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { Tabs, tabPanelProps } from '../../pump-ds/tabs/index.js';
import { mutationKeys, useProducts, usePricing, usePricingHistory } from '../../query/hooks.js';
import { useWriteStates, type WriteEntry } from '../../query/pendingWrites.js';
import { useFlashingRows } from '../../utils/rowFlash.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { withNextStep } from '../primitives/ToastProvider.js';
import { formatMoney, formatSignedMoney } from '../../utils/format.js';
import {
  Button,
  Chip,
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  Panel,
  SearchInput,
  SectionHeader,
  StatusChip,
  type TableColumn,
} from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { countOf } from '../../utils/ledgerWindow.js';
import {
  buildFuelPriceRows,
  fuelPriceWriteKey,
  sortNewestFirst,
  unconfirmedAttempt,
  type FuelPriceAttempt,
  type FuelPriceWriteVars,
  type CurrentFuelPrice,
  type FuelPriceHistoryEntry,
  type FuelPriceRow,
} from './fuelPriceRows.js';
import { ChangePriceDrawer, MrpDrawer, type MerchRow } from './PricingDrawers.js';

type TabType = 'fuels' | 'merchandise';
type MerchFilter = 'all' | 'unpriced';

interface FuelPricingPanelProps {
  selectedStation: Station | null;
}

interface HistoryRow extends FuelPriceHistoryEntry {
  productName: string;
}

const isPriced = (p: MerchRow) => p.sellingPrice != null && Number(p.sellingPrice) > 0;

/** The fuel rows and the queries they read, shared by the page action and the Fuels tab. */
function useFuelPriceRows(stationId: string) {
  const pricingQ = usePricing(stationId);
  const historyQ = usePricingHistory(stationId);
  const productsQ = useProducts();
  const rows = useMemo(() => {
    const products: { id: string; unit?: string | null }[] = productsQ.data ?? [];
    const units = new Map(products.map((p) => [p.id, p.unit]));
    const current: CurrentFuelPrice[] = pricingQ.data ?? [];
    const entries: FuelPriceHistoryEntry[] = historyQ.data ?? [];
    return buildFuelPriceRows(current, entries, (id) => units.get(id));
  }, [pricingQ.data, historyQ.data, productsQ.data]);
  return { rows, pricingQ, historyQ, productsQ };
}

export const FuelPricingPanel: React.FC<FuelPricingPanelProps> = ({ selectedStation }) => {
  if (!selectedStation) {
    return (
      <PageFrame route={ROUTES.pricing}>
        <EmptyState
          icon={<ConceptIcon concept="stations" />}
          title="No station selected"
          description="Select a station to manage pricing."
        />
      </PageFrame>
    );
  }
  return <PricingPage station={selectedStation} />;
};

const PricingPage: React.FC<{ station: Station }> = ({ station }) => {
  const [activeTab, setActiveTab] = useState<TabType>('fuels');
  const [changing, setChanging] = useState<{
    row: FuelPriceRow;
    attempt: FuelPriceAttempt | null;
  } | null>(null);
  const { timeZone } = businessDateSettings(station.settings);
  const fuels = useFuelPriceRows(station.id);
  // Each fuel's price change in flight or refused, from the write itself (#606).
  const writes = useWriteStates(mutationKeys.fuelPrice(), fuelPriceWriteKey, station.id);
  // A fuel whose last change has an unknown outcome reopens on that attempt,
  // so the retry sends the same body under the same key (#606 review).
  const openChange = (row: FuelPriceRow) =>
    setChanging({ row, attempt: unconfirmedAttempt(writes.get(row.productId)) });

  return (
    <PageFrame
      route={ROUTES.pricing}
      subtitle="Fuel rates and product MRP for this station."
      actions={
        // The one page primary, the same on both tabs (#537 review).
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Icon name="pencil" size="sm" />}
          disabled={fuels.rows.length === 0}
          onClick={() => fuels.rows[0] && openChange(fuels.rows[0])}
        >
          Change price
        </Button>
      }
      tabs={
        <Tabs
          id="pricing"
          aria-label="Pricing views"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabType)}
          tabs={[
            { id: 'fuels', label: 'Fuels', concept: 'fuels' },
            { id: 'merchandise', label: 'Products', concept: 'products' },
          ]}
        />
      }
    >
      <div {...tabPanelProps('pricing', activeTab)} className="flex flex-col gap-6">
        {activeTab === 'fuels' ? (
          <FuelsTab {...fuels} writes={writes} timeZone={timeZone} onChange={openChange} />
        ) : (
          <ProductsTab />
        )}
      </div>
      {changing && (
        <ChangePriceDrawer
          stationId={station.id}
          timeZone={timeZone}
          fuels={fuels.rows}
          initial={changing.row}
          attempt={changing.attempt}
          onClose={() => setChanging(null)}
        />
      )}
    </PageFrame>
  );
};

// ---- Fuels: one card per fuel (owner decision, #605; was one row per fuel, #537) ----

/**
 * One fuel's price: the price per unit, when it took effect, the last change
 * (old → new and the signed difference, in plain ink: a price change is not a
 * problem) and "Change price", which opens the same drawer as before.
 */
const FuelPriceCard: React.FC<{
  row: FuelPriceRow;
  timeZone: string;
  onChange: () => void;
  /** Its price change in flight or refused (#606). */
  write?: WriteEntry<FuelPriceWriteVars>;
  /** Just saved: tinted for a moment, the main confirmation (#606). */
  flash?: boolean;
}> = ({ row, timeZone, onChange, write, flash }) => (
  <Panel
    role="region"
    aria-label={row.productName}
    data-testid="fuel-price-card"
    data-write={write?.state}
    data-flash={flash ? 'true' : undefined}
    className={cn(
      'transition-colors duration-500 motion-reduce:transition-none',
      flash && 'bg-success-bg',
    )}
  >
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[14px] font-semibold text-ink-strong">
          {row.productName}
        </span>
        {row.productCode && (
          <span className="shrink-0 font-mono text-[12px] text-ink-faint">{row.productCode}</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {write?.state === 'saving' ? (
          // No price before the server confirms it (#606).
          <span className="flex h-[30px] items-center">
            <StatusChip status="saving" size="md" />
          </span>
        ) : row.price == null ? (
          <span className="text-[20px] font-semibold text-ink-faint">Not set</span>
        ) : (
          <span className="font-mono text-[20px] font-semibold tabular-nums text-ink-strong">
            {formatMoney(row.price)}/{row.unit}
          </span>
        )}
        <span className="text-[12px] text-ink-muted">
          {row.effectiveFrom
            ? `Effective from ${formatStationDateTime(row.effectiveFrom, timeZone)}`
            : 'No price recorded yet'}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 text-[12px]">
        <span className="text-ink-muted">Last change</span>
        {row.lastChange ? (
          <span className="font-mono text-[13px] tabular-nums text-ink-default">
            {formatMoney(row.lastChange.from)} → {formatMoney(row.lastChange.to)}{' '}
            <span className="text-ink-muted">
              ({formatSignedMoney(row.lastChange.difference, { plus: true })})
            </span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-faint">None yet</span>
        )}
      </div>
      {write?.state === 'failed' &&
        (unconfirmedAttempt(write) ? (
          // Unknown outcome (no answer, timed out): the change may have
          // landed. Try again resends the same body under the same key.
          <div
            role="alert"
            className="flex flex-wrap items-center gap-x-2 text-[12px] text-danger-fg"
          >
            <span>Couldn&apos;t confirm the new rate.</span>
            <Button variant="ghost" size="xs" onClick={onChange}>
              Try again
            </Button>
          </div>
        ) : (
          <p role="alert" className="text-[12px] text-danger-fg">
            {withNextStep(
              `Not saved: ${write.error?.message || 'the server refused the new rate'}`,
              'Use Change price to try again.',
            )}
          </p>
        ))}
      <div className="mt-auto flex justify-end border-t border-border-soft pt-3">
        <Button
          variant="secondary"
          size="xs"
          onClick={onChange}
          disabled={write?.state === 'saving'}
          aria-label={`Change price of ${row.productName}`}
        >
          Change price
        </Button>
      </div>
    </div>
  </Panel>
);

const FuelsTab: React.FC<
  ReturnType<typeof useFuelPriceRows> & {
    writes: ReadonlyMap<string, WriteEntry<FuelPriceWriteVars>>;
    timeZone: string;
    onChange: (row: FuelPriceRow) => void;
  }
> = ({ rows, pricingQ, historyQ, productsQ, timeZone, onChange, writes }) => {
  const flashing = useFlashingRows();
  const history = useMemo(
    () => sortNewestFirst((historyQ.data ?? []) as HistoryRow[]),
    [historyQ.data],
  );

  const historyColumns = useMemo<TableColumn<HistoryRow>[]>(
    () => [
      { id: 'fuel', header: 'Fuel', kind: 'text', value: (r) => r.productName },
      { id: 'rate', header: 'Rate', kind: 'money', total: false, value: (r) => r.price },
      {
        id: 'effectiveFrom',
        header: 'Effective from',
        kind: 'text',
        value: (r) => formatStationDateTime(r.effectiveFrom, timeZone),
      },
    ],
    [timeZone],
  );

  return (
    <>
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Fuel prices"
          subtitle={pricingQ.data ? countOf(rows.length, 'fuel', 'fuels') : undefined}
        />
        <DataSection
          title="fuel prices"
          query={[pricingQ, historyQ, productsQ]}
          placeholderHeight={160}
          shape="cards"
          isEmpty={rows.length === 0}
          empty={
            <EmptyState
              compact
              icon={<ConceptIcon concept="fuels" />}
              title="No fuel products"
              description="Add fuel products in Station › Products first."
            />
          }
        >
          <ul
            aria-label="Fuel prices"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {rows.map((row) => (
              <li key={row.productId} className="flex flex-col [&>*]:flex-1">
                <FuelPriceCard
                  row={row}
                  timeZone={timeZone}
                  onChange={() => onChange(row)}
                  write={writes.get(row.productId)}
                  flash={flashing.has(row.productId)}
                />
              </li>
            ))}
          </ul>
        </DataSection>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Price history"
          subtitle={historyQ.data ? countOf(history.length, 'change', 'changes') : undefined}
        />
        <DataSection
          title="price history"
          query={historyQ}
          placeholderHeight={200}
          flush
          isEmpty={history.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<ConceptIcon concept="pricing" />}
                title="No price changes yet"
                description="Every fuel price change is listed here."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            title="price history"
            columns={historyColumns}
            rows={history}
            rowKey={(r) => r.id}
          />
        </DataSection>
      </section>
    </>
  );
};

// ---- Products: MRP per product ----

const ProductsTab: React.FC = () => {
  const productsQ = useProducts();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MerchFilter>('all');
  const [editing, setEditing] = useState<MerchRow | null>(null);

  const merchandise = useMemo(
    () =>
      ((productsQ.data ?? []) as MerchRow[]).filter(
        (p) => p.productType !== 'FUEL' && p.isActive !== false,
      ),
    [productsQ.data],
  );
  const unpricedCount = useMemo(
    () => merchandise.filter((p) => !isPriced(p)).length,
    [merchandise],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merchandise.filter(
      (p) =>
        (filter === 'all' || !isPriced(p)) &&
        (!q ||
          [p.name, p.code, p.brand, p.category].some((s) => (s ?? '').toLowerCase().includes(q))),
    );
  }, [merchandise, search, filter]);

  const columns = useMemo<TableColumn<MerchRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Product',
        kind: 'text',
        value: (r) => r.name,
        cell: (r) => (
          <span className="inline-flex flex-col leading-tight">
            <span className="font-medium text-ink-strong">{r.name}</span>
            {r.brand && <span className="mt-0.5 text-[12px] text-ink-muted">{r.brand}</span>}
          </span>
        ),
      },
      {
        id: 'code',
        header: 'Code',
        kind: 'text',
        value: (r) => r.code,
        cell: (r) => <span className="font-mono text-ink-muted">{r.code || '—'}</span>,
      },
      { id: 'category', header: 'Category', kind: 'text', value: (r) => r.category },
      { id: 'unit', header: 'Unit', kind: 'text', value: (r) => r.unit },
      {
        id: 'mrp',
        header: 'MRP',
        kind: 'money',
        total: false,
        value: (r) => (isPriced(r) ? r.sellingPrice : null),
        cell: (r) =>
          isPriced(r) ? (
            formatMoney(r.sellingPrice)
          ) : (
            <Chip tone="warning" size="md">
              Not set
            </Chip>
          ),
      },
      {
        id: 'action',
        header: '',
        kind: 'text',
        sortable: false,
        width: '120px',
        value: () => null,
        cell: (r) => (
          <span className="flex justify-end">
            <Button variant="secondary" size="xs" onClick={() => setEditing(r)}>
              {r.sellingPrice != null ? 'Edit price' : 'Set price'}
            </Button>
          </span>
        ),
      },
    ],
    [],
  );

  const filtered = filter !== 'all' || search.trim() !== '';

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Product prices"
        subtitle={
          productsQ.data
            ? filtered
              ? `${rows.length} of ${merchandise.length}`
              : countOf(merchandise.length, 'product', 'products')
            : undefined
        }
        controls={{
          search: (
            <div className="w-[240px]">
              <SearchInput
                inputSize="sm"
                value={search}
                onChange={setSearch}
                placeholder="Search product / code / brand…"
              />
            </div>
          ),
          filters: (
            <FilterChips
              aria-label="Product price filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: merchandise.length },
                { value: 'unpriced', label: 'No MRP', count: unpricedCount, status: 'unpaid' },
              ]}
            />
          ),
        }}
      />
      <DataSection
        title="product prices"
        query={productsQ}
        placeholderHeight={240}
        flush
        isEmpty={rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<ConceptIcon concept="products" />}
              title={merchandise.length === 0 ? 'No products' : 'No matching products'}
              description={
                merchandise.length === 0
                  ? 'Add non-fuel products in Station › Products.'
                  : 'Try a different search or filter.'
              }
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          title="product prices"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
        />
      </DataSection>
      {editing && <MrpDrawer product={editing} onClose={() => setEditing(null)} />}
    </section>
  );
};
