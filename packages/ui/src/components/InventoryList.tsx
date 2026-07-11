import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Database, ArrowUpRight, ArrowDownRight, ClipboardCheck, Package, ArrowLeftRight, Scale, Search } from 'lucide-react';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { Tabs } from './primitives/Tabs.js';
import { Drawer } from './Drawer.js';
import { Field, NumberInput, TextInput, Select } from './primitives/Field.js';
import { CloudTransactionService } from '../services/cloud.js';
import { useInventoryStatus, useInventoryItems, useInventoryMovements, useInventoryVariances } from '../query/hooks.js';
import { Panel, Button, KpiStrip, KpiTile, StatusChip, Chip, MeterRow, EmptyState } from '../pump-ds/index.js';
import { tankPct, classifyTank } from '../utils/stock.js';
import type { NavIntent } from './AppShell.js';

const transactionService = new CloudTransactionService();

interface InventoryListProps {
  selectedStation: any | null;
  intent?: NavIntent | null;
  onIntentConsumed?: () => void;
}

type TabType = 'tanks' | 'items' | 'movements' | 'variances';

const fmtL = (n: number) => `${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <div style={{ position: 'relative' }}>
    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ height: '28px', padding: '0 8px 0 26px', width: '220px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }} />
  </div>
);

const movementColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'businessDate', header: 'Business Day', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{fmtDate(getValue())}</span> },
  { accessorKey: 'productName', header: 'Product', cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{row.original.productName}</span> },
  {
    accessorKey: 'movementType',
    header: 'Type',
    cell: ({ getValue }) => {
      const t = getValue() as string;
      const tone = t === 'Purchase' ? 'info' : t === 'Variance' ? 'danger' : t === 'Adjustment' ? 'warning' : t === 'Sale' ? 'success' : 'neutral';
      return <Chip tone={tone} size="xs">{t}</Chip>;
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Quantity',
    cell: ({ row }) => {
      const q = Number(row.original.quantity);
      const unit = row.original.productUnit ?? 'L';
      const positive = q > 0;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontFamily: 'var(--font-mono)', color: positive ? 'var(--state-success-fg)' : 'var(--text-strong)', fontWeight: positive ? 600 : 400 }}>
          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(q).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {unit}
        </span>
      );
    },
  },
  { accessorKey: 'referenceType', header: 'Reference', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) ?? 'N/A'}</span> },
  { accessorKey: 'tankName', header: 'Tank', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) ?? '—'}</span> },
];

const varianceColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'businessDate', header: 'Business Day', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{fmtDate(getValue())}</span> },
  { accessorKey: 'productName', header: 'Product', cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{row.original.productName}</span> },
  { accessorKey: 'expectedQuantity', header: 'Expected', cell: ({ row }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{Number(row.original.expectedQuantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {row.original.productUnit ?? 'L'}</span> },
  { accessorKey: 'actualQuantity', header: 'Actual', cell: ({ row }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{Number(row.original.actualQuantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {row.original.productUnit ?? 'L'}</span> },
  {
    accessorKey: 'varianceQuantity',
    header: 'Variance',
    cell: ({ row }) => {
      const diff = Number(row.original.varianceQuantity);
      const unit = row.original.productUnit ?? 'L';
      const color = diff < 0 ? 'var(--state-danger-fg)' : diff > 0 ? 'var(--state-info-fg)' : 'var(--text-strong)';
      return (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
          {diff > 0 ? `+${diff.toLocaleString('en-IN', { maximumFractionDigits: 3 })}` : diff.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {unit}
        </span>
      );
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const diff = Number(row.original.varianceQuantity);
      const expected = Number(row.original.expectedQuantity);
      const tol = 0.005 * (Math.abs(expected) || 1);
      const status = Math.abs(diff) <= tol ? 'balanced' : diff < 0 ? 'shortage' : 'excess';
      return <StatusChip status={status} size="xs" />;
    },
  },
  { accessorKey: 'reason', header: 'Reason', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) ?? 'Reconciliation run'}</span> },
];

const itemColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'name', header: 'Product', cell: ({ row }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{row.original.name}</span> },
  { accessorKey: 'code', header: 'Code', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) ?? '—'}</span> },
  { accessorKey: 'productType', header: 'Type', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) ?? '—'}</span> },
  { accessorKey: 'unit', header: 'Unit', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) ?? '—'}</span> },
  {
    accessorKey: 'quantity',
    header: 'On Hand',
    cell: ({ row }) => {
      const q = Number(row.original.quantity);
      const oversold = q < 0;
      const empty = q === 0;
      const color = oversold ? 'var(--state-danger-fg)' : empty ? 'var(--state-warning-fg)' : 'var(--text-strong)';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>{q.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {row.original.unit ?? ''}</span>
          {oversold && <Chip tone="danger" size="xs">Oversold</Chip>}
          {empty && <Chip tone="warning" size="xs">Out of stock</Chip>}
        </span>
      );
    },
  },
];

export const InventoryList: React.FC<InventoryListProps> = ({ selectedStation, intent, onIntentConsumed }) => {
  const [activeTab, setActiveTab] = useState<TabType>('tanks');
  const stationId = selectedStation?.id ?? null;

  const tanksQ = useInventoryStatus(stationId);
  const itemsQ = useInventoryItems(stationId);
  const movementsQ = useInventoryMovements(stationId);
  const variancesQ = useInventoryVariances(stationId);

  const refresh = () => {
    tanksQ.refetch();
    itemsQ.refetch();
    movementsQ.refetch();
    variancesQ.refetch();
  };

  // Deep-link focus (from a dashboard/bell stock alert): switch to the target
  // tab and highlight the offending tank card / merchandise row.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handledIntentRef = useRef<NavIntent | null>(null);
  useEffect(() => {
    if (!intent || handledIntentRef.current === intent) return;
    if (intent.focusInventoryTab) {
      handledIntentRef.current = intent;
      setActiveTab(intent.focusInventoryTab);
      setHighlightId(intent.focusInventoryId ?? null);
      onIntentConsumed?.();
    }
  }, [intent, onIntentConsumed]);
  // Fade the highlight out after a few seconds so it doesn't linger.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightId]);

  // Stock count / opening balance / adjustment
  const [countOpen, setCountOpen] = useState(false);
  const [countScope, setCountScope] = useState<'item' | 'tank'>('item');
  const [countTargetId, setCountTargetId] = useState('');
  const [countActual, setCountActual] = useState('');
  const [countReason, setCountReason] = useState('');
  const [countSubmitting, setCountSubmitting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  const items = itemsQ.data ?? [];
  const tanksData = tanksQ.data ?? [];

  const kpis = useMemo(() => {
    const totalFuel = tanksData.reduce((s: number, t: any) => s + Number(t.currentVolume || 0), 0);
    const lowTanks = tanksData.filter((t: any) => classifyTank(tankPct(t.currentVolume, t.capacity)) !== 'ok').length;
    const oversold = items.filter((i: any) => Number(i.quantity) < 0).length;
    const outOfStock = items.filter((i: any) => Number(i.quantity) === 0).length;
    const variances = (variancesQ.data ?? []).length;
    return { totalFuel, lowTanks, oversold, outOfStock, variances };
  }, [tanksData, items, variancesQ.data]);

  const [movementSearch, setMovementSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    const d = movementsQ.data ?? [];
    if (!q) return d;
    return d.filter((m: any) => (m.productName || '').toLowerCase().includes(q) || (m.movementType || '').toLowerCase().includes(q) || (m.tankName || '').toLowerCase().includes(q));
  }, [movementsQ.data, movementSearch]);
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i: any) => (i.name || '').toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q));
  }, [items, itemSearch]);

  const openCount = (scope: 'item' | 'tank') => {
    setCountScope(scope);
    setCountTargetId(scope === 'item' ? (items[0]?.productId ?? '') : (tanksData[0]?.id ?? ''));
    setCountActual('');
    setCountReason('');
    setCountError(null);
    setCountOpen(true);
  };

  const submitCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stationId || !countTargetId || countActual === '') return;
    try {
      setCountSubmitting(true);
      setCountError(null);
      let productId = countTargetId;
      let tankId: string | null = null;
      if (countScope === 'tank') {
        const tank = tanksData.find((t: any) => t.id === countTargetId);
        productId = tank?.productId ?? '';
        tankId = countTargetId;
      }
      await transactionService.recordStockCount({
        stationId,
        productId,
        actualQuantity: Number(countActual),
        tankId,
        reason: countReason || undefined,
      });
      setCountOpen(false);
      refresh();
    } catch (err: any) {
      setCountError(err.message || 'Failed to record stock count');
    } finally {
      setCountSubmitting(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px', fontFamily: 'var(--font-sans)' }}>
        Please select a station to view inventory.
      </div>
    );
  }

  const tanks = tanksQ.data ?? [];

  return (
    <div className="animate-fade-in">
      <PageLayout
        title="Inventory Management"
        subtitle="Monitor tank stock levels, audit physical dip variances, and inspect fuel movements."
        actions={
          <Button variant="primary" size="sm" leftIcon={<ClipboardCheck />} onClick={() => openCount(activeTab === 'tanks' ? 'tank' : 'item')}>
            Reconcile Stock
          </Button>
        }
        toolbar={
          <Tabs
            variant="underline"
            aria-label="Inventory views"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            tabs={[
              { id: 'tanks', label: 'Tank Status', icon: <Database size={15} /> },
              { id: 'items', label: 'Merchandise Stock', icon: <Package size={15} /> },
              { id: 'movements', label: 'Stock Movements', icon: <ArrowLeftRight size={15} /> },
              { id: 'variances', label: 'Reconciliations', icon: <Scale size={15} /> },
            ]}
          />
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <KpiStrip columns="auto">
            <KpiTile dot="brand" label="Total Fuel Stock" value={fmtL(kpis.totalFuel)} hint={`${tanksData.length} ${tanksData.length === 1 ? 'tank' : 'tanks'}`} />
            <KpiTile dot={kpis.lowTanks > 0 ? 'warning' : 'success'} valueTone={kpis.lowTanks > 0 ? 'warning' : undefined} label="Tanks Low / Critical" value={String(kpis.lowTanks)} hint="below 35% capacity" />
            <KpiTile dot={kpis.outOfStock > 0 ? 'warning' : 'success'} valueTone={kpis.outOfStock > 0 ? 'warning' : undefined} label="Out of Stock" value={String(kpis.outOfStock)} hint="zero on-hand" />
            <KpiTile dot={kpis.oversold > 0 ? 'danger' : 'success'} valueTone={kpis.oversold > 0 ? 'danger' : undefined} label="Oversold Items" value={String(kpis.oversold)} hint="negative on-hand" />
            <KpiTile dot="neutral" label="Reconciliations" value={String(kpis.variances)} hint="variances logged" />
          </KpiStrip>

          {activeTab === 'tanks' && (
            tanksQ.isLoading ? (
              <div style={{ padding: '16px' }}><EmptyState compact icon={<Database />} title="Loading tanks…" description="Fetching current tank levels." /></div>
            ) : tanks.length === 0 ? (
              <EmptyState compact icon={<Database />} title="No fuel tanks" description="No fuel tanks configured for this station." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                {tanks.map((tank: any) => {
                  const cap = Number(tank.capacity) || 0;
                  const vol = Number(tank.currentVolume) || 0;
                  const pct = tankPct(vol, cap);
                  const level = classifyTank(pct);
                  const tone = level === 'critical' ? 'danger' : level === 'low' ? 'warning' : 'success';
                  const label = level === 'critical' ? 'Critical' : level === 'low' ? 'Low' : 'OK';
                  const highlighted = highlightId === tank.id;
                  return (
                    <div
                      key={tank.id}
                      ref={(el) => { if (el && highlighted) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                      style={{ backgroundColor: 'var(--bg-surface)', border: `1px solid ${highlighted ? 'var(--state-info-fg)' : 'var(--border-soft)'}`, borderRadius: 'var(--radius-card)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: highlighted ? '0 0 0 3px var(--state-info-bg)' : undefined, transition: 'border-color 0.4s ease, box-shadow 0.4s ease' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ minWidth: 0 }}>
                          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>{tank.name}</h4>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{tank.productName} · {tank.productCode}</span>
                        </div>
                        <Chip tone={tone} size="xs">{label}</Chip>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                          {vol.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>L</span>
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>of {cap.toLocaleString('en-IN')} L</span>
                      </div>
                      <MeterRow label="" value={vol} max={cap || 1} tone="auto" valueLabel={`${pct.toFixed(0)}% capacity`} />
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'items' && (
            <Panel flush title="Merchandise stock" action={<SearchBox value={itemSearch} onChange={setItemSearch} placeholder="Search product / code…" />}>
              {itemsQ.isLoading ? (
                <div style={{ padding: '16px' }}><EmptyState compact icon={<Package />} title="Loading…" description="Fetching merchandise stock." /></div>
              ) : filteredItems.length === 0 ? (
                <div style={{ padding: '12px' }}><EmptyState compact icon={<Package />} title={items.length === 0 ? 'No merchandise' : 'No matches'} description={items.length === 0 ? 'Add non-fuel products in Station Overview → Products.' : 'Try a different search.'} /></div>
              ) : (
                <DataTable bare columns={itemColumns} data={filteredItems} emptyMessage="No merchandise." getRowId={(r: any) => r.productId} initialSorting={[{ id: 'name', desc: false }]} highlightRowId={highlightId} />
              )}
            </Panel>
          )}

          {activeTab === 'movements' && (
            <Panel flush title="Stock movements" action={<SearchBox value={movementSearch} onChange={setMovementSearch} placeholder="Search product / type / tank…" />}>
              {movementsQ.isLoading ? (
                <div style={{ padding: '16px' }}><EmptyState compact icon={<ArrowLeftRight />} title="Loading…" description="Fetching movements." /></div>
              ) : filteredMovements.length === 0 ? (
                <div style={{ padding: '12px' }}><EmptyState compact icon={<ArrowLeftRight />} title={(movementsQ.data ?? []).length === 0 ? 'No movements' : 'No matches'} description={(movementsQ.data ?? []).length === 0 ? 'No stock movements recorded.' : 'Try a different search.'} /></div>
              ) : (
                <DataTable bare columns={movementColumns} data={filteredMovements} emptyMessage="No stock movements." getRowId={(r: any) => r.id} />
              )}
            </Panel>
          )}

          {activeTab === 'variances' && (
            <Panel flush title="Reconciliations">
              {variancesQ.isLoading ? (
                <div style={{ padding: '16px' }}><EmptyState compact icon={<Scale />} title="Loading…" description="Fetching variances." /></div>
              ) : (variancesQ.data ?? []).length === 0 ? (
                <div style={{ padding: '12px' }}><EmptyState compact icon={<Scale />} title="No reconciliations" description="No reconciliation logs or physical variances logged yet." /></div>
              ) : (
                <DataTable bare columns={varianceColumns} data={variancesQ.data} emptyMessage="No variances." getRowId={(r: any) => r.id} />
              )}
            </Panel>
          )}
        </div>
      </PageLayout>

      <Drawer isOpen={countOpen} onClose={() => setCountOpen(false)} title="Stock Reconciliation">
        <form onSubmit={submitCount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Enter the physically measured quantity. Book stock is reconciled to it (a variance is logged and an adjustment movement posts the difference). Use this to set an opening balance for a new product or correct a count.
          </div>
          {countError && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>{countError}</div>
          )}
          <Field label="Scope">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {(['item', 'tank'] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={countScope === s ? 'primary' : 'secondary'}
                  size="sm"
                  fullWidth
                  leftIcon={s === 'item' ? <Package /> : <Database />}
                  onClick={() => { setCountScope(s); setCountTargetId(s === 'item' ? (items[0]?.productId ?? '') : (tanksData[0]?.id ?? '')); }}
                >
                  {s === 'item' ? 'Merchandise' : 'Fuel Tank'}
                </Button>
              ))}
            </div>
          </Field>
          <Field label={countScope === 'item' ? 'Product' : 'Tank'}>
            <Select value={countTargetId} onChange={(e) => setCountTargetId(e.target.value)} required>
              {countScope === 'item'
                ? items.map((i: any) => <option key={i.productId} value={i.productId}>{i.name} ({i.code}) — on hand {Number(i.quantity).toLocaleString('en-IN')} {i.unit ?? ''}</option>)
                : tanksData.map((t: any) => <option key={t.id} value={t.id}>{t.name} — {t.productName} — {Number(t.currentVolume).toLocaleString('en-IN')} L</option>)}
            </Select>
          </Field>
          <Field label="Actual Counted Quantity">
            <NumberInput min="0" step="any" value={countActual} onChange={(e) => setCountActual(e.target.value)} placeholder="Measured quantity" required />
          </Field>
          <Field label="Reason" hint="optional">
            <TextInput value={countReason} onChange={(e) => setCountReason(e.target.value)} placeholder="e.g. opening stock, monthly count, breakage" />
          </Field>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Button type="submit" variant="primary" size="md" fullWidth loading={countSubmitting} disabled={!countTargetId || countActual === ''}>
              Reconcile Stock
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setCountOpen(false)} disabled={countSubmitting}>Cancel</Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
};
