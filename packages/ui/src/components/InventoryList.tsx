import React, { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Database, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight, ClipboardCheck } from 'lucide-react';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { Tabs } from './primitives/Tabs.js';
import { Drawer } from './Drawer.js';
import { CloudTransactionService } from '../services/cloud.js';
import { useInventoryStatus, useInventoryItems, useInventoryMovements, useInventoryVariances } from '../query/hooks.js';

const transactionService = new CloudTransactionService();

interface InventoryListProps {
  selectedStation: any | null;
}

type TabType = 'tanks' | 'items' | 'movements' | 'variances';

const fmtL = (n: number) => `${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const movementColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'businessDate', header: 'Business Day', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{fmtDate(getValue())}</span> },
  { accessorKey: 'productName', header: 'Product', cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{row.original.productName}</span> },
  {
    accessorKey: 'movementType',
    header: 'Type',
    cell: ({ getValue }) => {
      const t = getValue() as string;
      const tone = t === 'Purchase' ? 'info' : t === 'Variance' ? 'danger' : 'default';
      const bg = tone === 'info' ? 'var(--state-info-bg)' : tone === 'danger' ? 'var(--state-danger-bg)' : 'var(--border-soft)';
      const fg = tone === 'info' ? 'var(--state-info-fg)' : tone === 'danger' ? 'var(--state-danger-fg)' : 'var(--text-strong)';
      return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: bg, color: fg }}>{t}</span>;
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
      const expected = Number(row.original.expectedQuantity);
      const severe = Math.abs(diff) > 0.005 * (expected || 1);
      const color = diff < 0 ? 'var(--state-danger-fg)' : diff > 0 ? 'var(--state-success-fg)' : 'var(--text-strong)';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
          {diff > 0 ? `+${diff.toLocaleString('en-IN', { maximumFractionDigits: 3 })}` : diff.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {unit}
          {severe && <AlertTriangle size={12} style={{ color: 'var(--state-warning-fg)' }} />}
        </span>
      );
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
      const low = q <= 0;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: low ? 'var(--state-danger-fg)' : 'var(--text-strong)' }}>
          {q.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {row.original.unit ?? ''}
          {low && <AlertTriangle size={12} style={{ color: 'var(--state-warning-fg)' }} />}
        </span>
      );
    },
  },
];

export const InventoryList: React.FC<InventoryListProps> = ({ selectedStation }) => {
  const [activeTab, setActiveTab] = useState<TabType>('tanks');
  const stationId = selectedStation?.id ?? null;

  const tanksQ = useInventoryStatus(stationId);
  const itemsQ = useInventoryItems(stationId);
  const movementsQ = useInventoryMovements(stationId);
  const variancesQ = useInventoryVariances(stationId);

  const refreshing = tanksQ.isFetching || itemsQ.isFetching || movementsQ.isFetching || variancesQ.isFetching;
  const refresh = () => {
    tanksQ.refetch();
    itemsQ.refetch();
    movementsQ.refetch();
    variancesQ.refetch();
  };

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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openCount(activeTab === 'tanks' ? 'tank' : 'item')}>
              <ClipboardCheck size={14} /> Record Count
            </button>
          </div>
        }
        toolbar={
          <Tabs
            variant="underline"
            aria-label="Inventory views"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            tabs={[
              { id: 'tanks', label: 'Tank Status' },
              { id: 'items', label: 'Merchandise Stock' },
              { id: 'movements', label: 'Stock Movements' },
              { id: 'variances', label: 'Physical Reconciliations' },
            ]}
          />
        }
      >
        {activeTab === 'tanks' && (
          tanksQ.isLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
          ) : tanks.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No fuel tanks configured for this station.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-5)' }}>
              {tanks.map((tank: any) => {
                const pct = Math.min(100, Math.max(0, (tank.currentVolume / tank.capacity) * 100));
                const color = pct < 15 ? 'var(--state-danger-fg)' : pct < 35 ? 'var(--state-warning-fg)' : 'var(--state-success-fg)';
                return (
                  <div key={tank.id} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>{tank.name}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{tank.productName} ({tank.productCode})</span>
                      </div>
                      <Database size={18} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                        {tank.currentVolume.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>L</span>
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>of {tank.capacity.toLocaleString('en-IN')} L</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ height: '6px', backgroundColor: 'var(--border-soft)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, transition: 'width 0.4s ease', borderRadius: '3px' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{pct.toFixed(0)}% Capacity</span>
                        {pct < 15 && <span style={{ color: 'var(--state-danger-fg)', display: 'flex', alignItems: 'center', gap: '2px' }}><AlertTriangle size={10} /> Low Stock</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === 'items' && (
          <DataTable
            columns={itemColumns}
            data={itemsQ.data}
            isLoading={itemsQ.isLoading}
            error={itemsQ.error as Error | null}
            emptyMessage="No merchandise products configured. Add non-fuel products in Station Overview → Products."
            getRowId={(r: any) => r.productId}
            initialSorting={[{ id: 'name', desc: false }]}
          />
        )}

        {activeTab === 'movements' && (
          <DataTable
            columns={movementColumns}
            data={movementsQ.data}
            isLoading={movementsQ.isLoading}
            error={movementsQ.error as Error | null}
            emptyMessage="No stock movements recorded."
            getRowId={(r: any) => r.id}
          />
        )}

        {activeTab === 'variances' && (
          <DataTable
            columns={varianceColumns}
            data={variancesQ.data}
            isLoading={variancesQ.isLoading}
            error={variancesQ.error as Error | null}
            emptyMessage="No reconciliation logs or physical variances logged yet."
            getRowId={(r: any) => r.id}
          />
        )}
      </PageLayout>

      <Drawer isOpen={countOpen} onClose={() => setCountOpen(false)} title="Record Stock Count / Opening Balance">
        <form onSubmit={submitCount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Enter the physically measured quantity. Book stock is reconciled to it (a variance is logged and an adjustment movement posts the difference). Use this to set an opening balance for a new product or correct a count.
          </div>
          {countError && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>{countError}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label className="field-label">Scope</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {(['item', 'tank'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setCountScope(s); setCountTargetId(s === 'item' ? (items[0]?.productId ?? '') : (tanksData[0]?.id ?? '')); }}
                  style={{ height: '32px', fontSize: '12px', fontWeight: 600, backgroundColor: countScope === s ? 'var(--brand-primary)' : 'var(--bg-surface-alt)', color: countScope === s ? 'white' : 'var(--text-default)', border: countScope === s ? 'none' : '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}
                >
                  {s === 'item' ? 'Merchandise Item' : 'Fuel Tank'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label className="field-label">{countScope === 'item' ? 'Product' : 'Tank'}</label>
            <select className="input" value={countTargetId} onChange={(e) => setCountTargetId(e.target.value)} required>
              {countScope === 'item'
                ? items.map((i: any) => <option key={i.productId} value={i.productId}>{i.name} ({i.code}) — on hand {Number(i.quantity).toLocaleString('en-IN')} {i.unit ?? ''}</option>)
                : tanksData.map((t: any) => <option key={t.id} value={t.id}>{t.name} — {t.productName} — {Number(t.currentVolume).toLocaleString('en-IN')} L</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label className="field-label">Actual Counted Quantity</label>
            <input className="input" type="number" min="0" step="any" value={countActual} onChange={(e) => setCountActual(e.target.value)} placeholder="Measured quantity" required style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label className="field-label">Reason (optional)</label>
            <input className="input" type="text" value={countReason} onChange={(e) => setCountReason(e.target.value)} placeholder="e.g. opening stock, monthly count, breakage" />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="submit" className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={countSubmitting || !countTargetId || countActual === ''}>
              {countSubmitting ? 'Recording…' : 'Record Count'}
            </button>
            <button type="button" className="btn btn-secondary btn-md" onClick={() => setCountOpen(false)} disabled={countSubmitting}>Cancel</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
};
