import React, { useMemo, useState } from 'react';
import { businessDateSettings, formatStationDateTime, type Station } from '@pump/shared';
import { PageFrame } from '../page-frame/index.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { Tabs, tabPanelProps } from '../../pump-ds/tabs/index.js';
import { useProducts, usePricing, usePricingHistory } from '../../query/hooks.js';
import { formatMoney } from '../../utils/format.js';
import {
  Button,
  Chip,
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  type TableColumn,
} from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { countOf } from '../../utils/ledgerWindow.js';
import {
  buildFuelPriceRows,
  sortNewestFirst,
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
  const [changing, setChanging] = useState<FuelPriceRow | null>(null);
  const { timeZone } = businessDateSettings(station.settings);
  const fuels = useFuelPriceRows(station.id);

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
          onClick={() => setChanging(fuels.rows[0] ?? null)}
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
          <FuelsTab {...fuels} timeZone={timeZone} onChange={setChanging} />
        ) : (
          <ProductsTab />
        )}
      </div>
      {changing && (
        <ChangePriceDrawer
          stationId={station.id}
          timeZone={timeZone}
          fuels={fuels.rows}
          initial={changing}
          onClose={() => setChanging(null)}
        />
      )}
    </PageFrame>
  );
};

// ---- Fuels: one row per fuel (owner decision, #537) ----

const FuelsTab: React.FC<
  ReturnType<typeof useFuelPriceRows> & {
    timeZone: string;
    onChange: (row: FuelPriceRow) => void;
  }
> = ({ rows, pricingQ, historyQ, productsQ, timeZone, onChange }) => {
  const history = useMemo(
    () => sortNewestFirst((historyQ.data ?? []) as HistoryRow[]),
    [historyQ.data],
  );

  const columns = useMemo<TableColumn<FuelPriceRow>[]>(
    () => [
      {
        id: 'product',
        header: 'Product',
        kind: 'text',
        value: (r) => r.productName,
        cell: (r) => (
          <span className="inline-flex flex-col leading-tight">
            <span className="font-medium text-ink-strong">{r.productName}</span>
            {r.productCode && (
              <span className="mt-0.5 text-[12px] text-ink-muted">{r.productCode}</span>
            )}
          </span>
        ),
      },
      {
        id: 'price',
        header: 'Current price',
        kind: 'money',
        total: false,
        emphasis: true,
        value: (r) => r.price,
        cell: (r) =>
          r.price == null ? (
            <span className="text-ink-faint">Not set</span>
          ) : (
            `${formatMoney(r.price)}/${r.unit}`
          ),
      },
      {
        id: 'effectiveFrom',
        header: 'Effective from',
        kind: 'text',
        value: (r) => (r.effectiveFrom ? formatStationDateTime(r.effectiveFrom, timeZone) : null),
      },
      {
        id: 'lastChange',
        header: 'Last change',
        kind: 'text',
        sortable: false,
        value: (r) =>
          r.lastChange
            ? `${formatMoney(r.lastChange.from)} → ${formatMoney(r.lastChange.to)}`
            : null,
        cell: (r) =>
          r.lastChange ? (
            <span className="font-mono tabular-nums">
              {formatMoney(r.lastChange.from)} → {formatMoney(r.lastChange.to)}
            </span>
          ) : (
            <span className="text-ink-faint">—</span>
          ),
      },
      {
        id: 'action',
        header: '',
        kind: 'text',
        sortable: false,
        width: '140px',
        value: () => null,
        cell: (r) => (
          <span className="flex justify-end">
            <Button variant="secondary" size="xs" onClick={() => onChange(r)}>
              Change price
            </Button>
          </span>
        ),
      },
    ],
    [onChange, timeZone],
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
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<ConceptIcon concept="fuels" />}
                title="No fuel products"
                description="Add fuel products in Station › Products first."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            title="fuel prices"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.productId}
          />
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
