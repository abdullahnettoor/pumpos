import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudPricingService, CloudProductService } from '../../services/cloud.js';
import type { Station } from '@pump/shared';
import { useToast } from '../primitives/ToastProvider.js';
import { PageFrame } from '../page-frame/index.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { Tabs, tabPanelProps } from '../../pump-ds/tabs/index.js';
import { Drawer } from '../Drawer.js';
import { Field, MoneyInput, Select, TextInput } from '../primitives/Field.js';
import { queryKeys, useProducts, usePricing, usePricingHistory } from '../../query/hooks.js';
import { formatDateTime, formatMoney } from '../../utils/format.js';
import {
  Button,
  Chip,
  DataSection,
  EmptyState,
  FilterChips,
  Form,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  type TableColumn,
} from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { useRunTask } from '../../utils/runTask.js';
import { countOf } from '../../utils/ledgerWindow.js';
import {
  buildFuelPriceRows,
  type CurrentFuelPrice,
  type FuelPriceHistoryEntry,
  type FuelPriceRow,
} from './fuelPriceRows.js';
import { useKeyedSave } from './useKeyedSave.js';

const pricingService = new CloudPricingService();
const productService = new CloudProductService();

type TabType = 'fuels' | 'merchandise';
type MerchFilter = 'all' | 'unpriced';

interface FuelPricingPanelProps {
  selectedStation: Station | null;
}

interface MerchRow {
  id: string;
  name: string;
  code?: string | null;
  brand?: string | null;
  category?: string | null;
  unit?: string | null;
  sellingPrice?: number | string | null;
  productType?: string;
  isActive?: boolean;
}

interface HistoryRow extends FuelPriceHistoryEntry {
  productName: string;
}

const isPriced = (p: MerchRow) => p.sellingPrice != null && Number(p.sellingPrice) > 0;

/** "Now" in the operator's local time, as a `datetime-local` value. */
const localNowInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export const FuelPricingPanel: React.FC<FuelPricingPanelProps> = ({ selectedStation }) => {
  const [activeTab, setActiveTab] = useState<TabType>('fuels');

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

  return (
    <PageFrame
      route={ROUTES.pricing}
      subtitle="Fuel rates and product MRP for this station."
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
        {activeTab === 'fuels' ? <FuelsTab stationId={selectedStation.id} /> : <ProductsTab />}
      </div>
    </PageFrame>
  );
};

// ---- Fuels: one row per fuel (owner decision, #537) ----

const FuelsTab: React.FC<{ stationId: string }> = ({ stationId }) => {
  const pricingQ = usePricing(stationId);
  const historyQ = usePricingHistory(stationId);
  const productsQ = useProducts();
  const [changing, setChanging] = useState<FuelPriceRow | null>(null);

  const rows = useMemo(() => {
    const products: { id: string; unit?: string | null }[] = productsQ.data ?? [];
    const units = new Map(products.map((p) => [p.id, p.unit]));
    const current: CurrentFuelPrice[] = pricingQ.data ?? [];
    const entries: FuelPriceHistoryEntry[] = historyQ.data ?? [];
    return buildFuelPriceRows(current, entries, (id) => units.get(id));
  }, [pricingQ.data, historyQ.data, productsQ.data]);

  const history = useMemo(() => ((historyQ.data ?? []) as HistoryRow[]).slice(), [historyQ.data]);

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
        value: (r) => (r.effectiveFrom ? formatDateTime(r.effectiveFrom) : null),
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
            <Button variant="secondary" size="xs" onClick={() => setChanging(r)}>
              Change price
            </Button>
          </span>
        ),
      },
    ],
    [],
  );

  const historyColumns = useMemo<TableColumn<HistoryRow>[]>(
    () => [
      { id: 'fuel', header: 'Fuel', kind: 'text', value: (r) => r.productName },
      { id: 'rate', header: 'Rate', kind: 'money', total: false, value: (r) => r.price },
      {
        id: 'effectiveFrom',
        header: 'Effective from',
        kind: 'text',
        value: (r) => formatDateTime(r.effectiveFrom),
      },
    ],
    [],
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
          query={[pricingQ, historyQ]}
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

      {changing && (
        <ChangePriceDrawer
          stationId={stationId}
          fuels={rows}
          initial={changing}
          onClose={() => setChanging(null)}
        />
      )}
    </>
  );
};

/** The existing fuel-rate flow and validation, in a drawer. */
const ChangePriceDrawer: React.FC<{
  stationId: string;
  fuels: FuelPriceRow[];
  initial: FuelPriceRow;
  onClose: () => void;
}> = ({ stationId, fuels, initial, onClose }) => {
  const toast = useToast();
  const runTask = useRunTask();
  const qc = useQueryClient();
  const save = useKeyedSave(`pricing:${stationId}`);
  const [productId, setProductId] = useState(initial.productId);
  const [price, setPrice] = useState('');
  // Computed once on open, so a re-render never fights the operator's edit.
  const [effectiveFrom, setEffectiveFrom] = useState(localNowInput);
  const [submitting, setSubmitting] = useState(false);
  const fuel = fuels.find((f) => f.productId === productId) ?? initial;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !price || submitting) return;
    const payload = {
      stationId,
      productId,
      price: parseFloat(price),
      effectiveFrom: new Date(effectiveFrom).toISOString(),
    };
    try {
      setSubmitting(true);
      await save(payload, (idempotencyKey) =>
        pricingService.recordPricing(payload, { idempotencyKey }),
      );
      toast.success('Fuel rate updated.');
      onClose();
      runTask(
        Promise.all([
          qc.invalidateQueries({ queryKey: queryKeys.pricing(stationId) }),
          qc.invalidateQueries({ queryKey: queryKeys.pricingHistory(stationId) }),
        ]),
        'Saved, but fuel pricing could not be refreshed.',
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to record new price');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Change price"
      subtitle={
        fuel.price == null
          ? `${fuel.productName} · no price yet`
          : `${fuel.productName} · now ${formatMoney(fuel.price)}/${fuel.unit}`
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="change-price-form"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={!productId || !price}
          >
            Apply new rate
          </Button>
        </div>
      }
    >
      <Form id="change-price-form" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Fuel product" required>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            {fuels.map((f) => (
              <option key={f.productId} value={f.productId}>
                {f.productName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Rate / ${fuel.unit} (₹)`} required>
          <MoneyInput
            step="0.01"
            placeholder="e.g. 96.43"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Effective from" required>
          <TextInput
            type="datetime-local"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            required
          />
        </Field>
      </Form>
    </Drawer>
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
            <Chip tone="warning" size="xs">
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

const MrpDrawer: React.FC<{ product: MerchRow; onClose: () => void }> = ({ product, onClose }) => {
  const toast = useToast();
  const runTask = useRunTask();
  const qc = useQueryClient();
  const save = useKeyedSave(`product-price:${product.id}`);
  const [value, setValue] = useState(
    product.sellingPrice != null ? String(product.sellingPrice) : '',
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const body = { sellingPrice: value === '' ? null : Number(value) };
    try {
      setSaving(true);
      await save({ id: product.id, ...body }, (idempotencyKey) =>
        productService.updateProduct(product.id, body, { idempotencyKey }),
      );
      toast.success('Price updated.');
      onClose();
      runTask(
        qc.invalidateQueries({ queryKey: queryKeys.products() }),
        'Saved, but products could not be refreshed.',
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update price');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Set price"
      subtitle={product.name}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" loading={saving} onClick={submit}>
            Save price
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-ink-muted">
          The MRP prefills this product on product sales. Leave it blank to clear it.
        </p>
        <Field label="MRP (₹)">
          <MoneyInput
            step="0.01"
            min="0"
            placeholder="e.g. 250"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </Field>
      </div>
    </Drawer>
  );
};
