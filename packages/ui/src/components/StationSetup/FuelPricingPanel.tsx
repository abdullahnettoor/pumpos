import React, { useState, useEffect, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CloudPricingService, CloudProductService } from '../../services/cloud.js';
import { Station } from '@pump/shared';
import { useToast } from '../primitives/ToastProvider.js';
import { PageLayout } from '../primitives/PageLayout.js';
import { Tabs } from '../primitives/Tabs.js';
import { DataTable } from '../primitives/DataTable.js';
import { Drawer } from '../Drawer.js';
import { Field, NumberInput, Select } from '../primitives/Field.js';
import { useProducts } from '../../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { inr, formatDate } from '../../utils/format.js';
import { Panel, Button, KpiStrip, KpiTile, EmptyState, Chip, DateText } from '../../pump-ds/index.js';
import { Fuel, Package, Search } from 'lucide-react';

const pricingService = new CloudPricingService();
const productService = new CloudProductService();

type TabType = 'fuels' | 'merchandise';

interface FuelPricingPanelProps {
  selectedStation: Station | null;
}

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <div style={{ position: 'relative' }}>
    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ height: '28px', padding: '0 8px 0 26px', width: '220px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }} />
  </div>
);

const fuelHistoryColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'productName', header: 'Fuel', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{getValue() as string}</span> },
  { accessorKey: 'price', header: 'Rate', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(getValue())}</span> },
  { accessorKey: 'effectiveFrom', header: 'Effective from', cell: ({ getValue }) => <DateText value={getValue() as string} variant="datetime" tone="muted" /> },
];

export const FuelPricingPanel: React.FC<FuelPricingPanelProps> = ({ selectedStation }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('fuels');

  // ---- Fuel pricing (time-effective, history-tracked) ----
  const [currentPrices, setCurrentPrices] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [price, setPrice] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  useEffect(() => {
    loadPricingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation]);

  const loadPricingData = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      const [pricesData, historyData] = await Promise.all([
        pricingService.getPricing(selectedStation.id),
        pricingService.getPricingHistory(selectedStation.id),
      ]);
      setCurrentPrices(pricesData);
      setHistory(historyData);
      if (pricesData.length > 0) setSelectedProductId(pricesData[0].productId);
      const localNow = new Date();
      localNow.setMinutes(localNow.getMinutes() - localNow.getTimezoneOffset());
      setEffectiveFrom(localNow.toISOString().slice(0, 16));
    } catch (err) {
      console.error('Failed to load pricing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation || !selectedProductId || !price || submitting) return;
    try {
      setSubmitting(true);
      await pricingService.recordPricing({
        stationId: selectedStation.id,
        productId: selectedProductId,
        price: parseFloat(price),
        effectiveFrom: new Date(effectiveFrom).toISOString(),
      });
      setPrice('');
      await loadPricingData();
      toast.success('Fuel rate updated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record new price');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Merchandise pricing (single MRP per product) ----
  const { data: products, isLoading: productsLoading } = useProducts();
  const merchandise = useMemo(
    () => (products || []).filter((p: any) => p.productType !== 'FUEL' && p.isActive !== false),
    [products],
  );
  const [merchSearch, setMerchSearch] = useState('');
  const filteredMerch = useMemo(() => {
    const q = merchSearch.trim().toLowerCase();
    if (!q) return merchandise;
    return merchandise.filter((p: any) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q),
    );
  }, [merchandise, merchSearch]);

  const merchKpis = useMemo(() => {
    const priced = merchandise.filter((p: any) => p.sellingPrice != null && Number(p.sellingPrice) > 0).length;
    return { total: merchandise.length, priced, unpriced: merchandise.length - priced };
  }, [merchandise]);

  const [priceProd, setPriceProd] = useState<any | null>(null);
  const [mrpValue, setMrpValue] = useState('');
  const [savingMrp, setSavingMrp] = useState(false);

  const openMrp = (p: any) => {
    setPriceProd(p);
    setMrpValue(p.sellingPrice != null ? String(p.sellingPrice) : '');
  };
  const saveMrp = async () => {
    if (!priceProd) return;
    try {
      setSavingMrp(true);
      await productService.updateProduct(priceProd.id, { sellingPrice: mrpValue === '' ? null : Number(mrpValue) });
      await qc.invalidateQueries({ queryKey: ['products'] });
      setPriceProd(null);
      toast.success('Price updated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update price');
    } finally {
      setSavingMrp(false);
    }
  };

  const merchColumns = useMemo<ColumnDef<any, any>[]>(() => [
    { accessorKey: 'name', header: 'Product', cell: ({ row }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{row.original.name}{row.original.brand ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {row.original.brand}</span> : null}</span> },
    { accessorKey: 'code', header: 'Code', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>{(getValue() as string) || '—'}</span> },
    { accessorKey: 'category', header: 'Category', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) || '—'}</span> },
    { accessorKey: 'unit', header: 'Unit', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) || '—'}</span> },
    {
      accessorKey: 'sellingPrice',
      header: 'MRP',
      cell: ({ getValue }) => {
        const v = getValue();
        return v != null && Number(v) > 0
          ? <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-strong)' }}>{inr(v)}</span>
          : <Chip tone="warning" size="xs">Not set</Chip>;
      },
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => <Button variant="secondary" size="xs" onClick={() => openMrp(row.original)}>{row.original.sellingPrice != null ? 'Edit price' : 'Set price'}</Button>,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  if (!selectedStation) {
    return <div style={{ color: 'var(--text-muted)', padding: '24px' }}>Please select a station to manage pricing.</div>;
  }

  return (
    <div className="animate-fade-in">
      <PageLayout
        title="Pricing"
        subtitle="Set fuel rates and merchandise MRP across your product catalogue."
        toolbar={
          <Tabs
            variant="underline"
            aria-label="Pricing views"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            tabs={[
              { id: 'fuels', label: 'Fuels', icon: <Fuel size={15} /> },
              { id: 'merchandise', label: 'Merchandise', icon: <Package size={15} /> },
            ]}
          />
        }
      >
        {activeTab === 'fuels' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!loading && currentPrices.length > 0 && (
              <KpiStrip columns="auto">
                {currentPrices.map((cp) => (
                  <KpiTile
                    key={cp.productId}
                    dot="brand"
                    label={`${cp.productName} · ${cp.productCode}`}
                    value={`${inr(cp.price)}/${(products || []).find((p: any) => p.id === cp.productId)?.unit || 'L'}`}
                    hint={cp.effectiveFrom ? `since ${formatDate(cp.effectiveFrom, { compact: true })}` : undefined}
                  />
                ))}
              </KpiStrip>
            )}
            <Panel title="Record a fuel rate">
              {currentPrices.length === 0 ? (
                <div style={{ padding: '4px' }}><EmptyState compact icon={<Fuel />} title="No fuel products" description="Configure fuel products in Station Overview → Products first." /></div>
              ) : (
                <form onSubmit={handleRecordPricing} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr', gap: '12px', alignItems: 'flex-end' }}>
                    <Field label="Fuel product" required>
                      <Select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} required>
                        {currentPrices.map((cp) => <option key={cp.productId} value={cp.productId}>{cp.productName}</option>)}
                      </Select>
                    </Field>
                    <Field label={`Rate / ${(products || []).find((p: any) => p.id === selectedProductId)?.unit || 'L'} (₹)`} required>
                      <NumberInput step="0.01" placeholder="e.g. 96.43" value={price} onChange={(e) => setPrice(e.target.value)} required />
                    </Field>
                    <Field label="Effective from" required>
                      <input type="datetime-local" className="input" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
                    </Field>
                  </div>
                  <div>
                    <Button type="submit" variant="primary" size="md" loading={submitting} disabled={!selectedProductId || !price}>Apply New Rate</Button>
                  </div>
                </form>
              )}
            </Panel>

            <Panel flush title="Price history">
              {loading ? (
                <div style={{ padding: '16px' }}><EmptyState compact icon={<Fuel />} title="Loading…" description="Fetching price history." /></div>
              ) : history.length === 0 ? (
                <div style={{ padding: '12px' }}><EmptyState compact icon={<Fuel />} title="No changes logged" description="Fuel rate changes will appear here." /></div>
              ) : (
                <DataTable bare columns={fuelHistoryColumns} data={history} getRowId={(r: any) => r.id} emptyMessage="No price changes." initialSorting={[{ id: 'effectiveFrom', desc: true }]} />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'merchandise' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <KpiStrip columns="auto">
              <KpiTile dot="brand" label="Products" value={String(merchKpis.total)} hint="non-fuel, active" />
              <KpiTile dot="success" valueTone="success" label="Priced" value={String(merchKpis.priced)} hint="MRP set" />
              <KpiTile dot={merchKpis.unpriced > 0 ? 'warning' : 'success'} valueTone={merchKpis.unpriced > 0 ? 'warning' : undefined} label="Unpriced" value={String(merchKpis.unpriced)} hint="no MRP" />
            </KpiStrip>

            <Panel flush title="Merchandise catalogue" action={<SearchBox value={merchSearch} onChange={setMerchSearch} placeholder="Search product / code / brand…" />}>
              {productsLoading ? (
                <div style={{ padding: '16px' }}><EmptyState compact icon={<Package />} title="Loading…" description="Fetching products." /></div>
              ) : filteredMerch.length === 0 ? (
                <div style={{ padding: '12px' }}><EmptyState compact icon={<Package />} title={merchandise.length === 0 ? 'No merchandise' : 'No matches'} description={merchandise.length === 0 ? 'Add non-fuel products in Station Overview → Products.' : 'Try a different search.'} /></div>
              ) : (
                <DataTable bare columns={merchColumns} data={filteredMerch} getRowId={(r: any) => r.id} emptyMessage="No merchandise." initialSorting={[{ id: 'name', desc: false }]} />
              )}
            </Panel>
          </div>
        )}
      </PageLayout>

      <Drawer isOpen={!!priceProd} onClose={() => setPriceProd(null)} title={priceProd ? `Set price — ${priceProd.name}` : 'Set price'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            The MRP (selling price) prefills this product on merchandise sales. Leave blank to clear it.
          </div>
          <Field label="MRP (₹)">
            <NumberInput step="0.01" min="0" placeholder="e.g. 250" value={mrpValue} onChange={(e) => setMrpValue(e.target.value)} autoFocus />
          </Field>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Button variant="primary" size="md" fullWidth loading={savingMrp} onClick={saveMrp}>Save Price</Button>
            <Button variant="secondary" size="md" disabled={savingMrp} onClick={() => setPriceProd(null)}>Cancel</Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
};
