import React, { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Database, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { useInventoryStatus, useInventoryMovements, useInventoryVariances } from '../query/hooks.js';

interface InventoryListProps {
  selectedStation: any | null;
}

type TabType = 'tanks' | 'movements' | 'variances';

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
    cell: ({ getValue }) => {
      const q = Number(getValue());
      const positive = q > 0;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontFamily: 'var(--font-mono)', color: positive ? 'var(--state-success-fg)' : 'var(--text-strong)', fontWeight: positive ? 600 : 400 }}>
          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {fmtL(Math.abs(q))}
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
  { accessorKey: 'expectedQuantity', header: 'Expected', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{fmtL(Number(getValue()))}</span> },
  { accessorKey: 'actualQuantity', header: 'Actual', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{fmtL(Number(getValue()))}</span> },
  {
    accessorKey: 'varianceQuantity',
    header: 'Variance',
    cell: ({ row }) => {
      const diff = Number(row.original.varianceQuantity);
      const expected = Number(row.original.expectedQuantity);
      const severe = Math.abs(diff) > 0.005 * (expected || 1);
      const color = diff < 0 ? 'var(--state-danger-fg)' : diff > 0 ? 'var(--state-success-fg)' : 'var(--text-strong)';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
          {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} L
          {severe && <AlertTriangle size={12} style={{ color: 'var(--state-warning-fg)' }} />}
        </span>
      );
    },
  },
  { accessorKey: 'reason', header: 'Reason', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) ?? 'Reconciliation run'}</span> },
];

export const InventoryList: React.FC<InventoryListProps> = ({ selectedStation }) => {
  const [activeTab, setActiveTab] = useState<TabType>('tanks');
  const stationId = selectedStation?.id ?? null;

  const tanksQ = useInventoryStatus(stationId);
  const movementsQ = useInventoryMovements(stationId);
  const variancesQ = useInventoryVariances(stationId);

  const refreshing = tanksQ.isFetching || movementsQ.isFetching || variancesQ.isFetching;
  const refresh = () => {
    tanksQ.refetch();
    movementsQ.refetch();
    variancesQ.refetch();
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px', fontFamily: 'var(--font-sans)' }}>
        Please select a station to view inventory.
      </div>
    );
  }

  const tabBtn = (tab: TabType): React.CSSProperties => ({
    padding: '10px 4px',
    fontSize: '14px',
    fontWeight: activeTab === tab ? 600 : 500,
    color: activeTab === tab ? 'var(--brand-primary)' : 'var(--text-muted)',
    borderBottom: activeTab === tab ? '2px solid var(--brand-primary)' : '2px solid transparent',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  });

  const tanks = tanksQ.data ?? [];

  return (
    <div className="animate-fade-in">
      <PageLayout
        title="Inventory Management"
        subtitle="Monitor tank stock levels, audit physical dip variances, and inspect fuel movements."
        actions={
          <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
        toolbar={
          <div style={{ display: 'flex', gap: 'var(--space-6)', borderBottom: '1px solid var(--border-soft)', width: '100%' }}>
            <button style={tabBtn('tanks')} onClick={() => setActiveTab('tanks')}>Tank Status</button>
            <button style={tabBtn('movements')} onClick={() => setActiveTab('movements')}>Stock Movements</button>
            <button style={tabBtn('variances')} onClick={() => setActiveTab('variances')}>Physical Reconciliations</button>
          </div>
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
    </div>
  );
};
