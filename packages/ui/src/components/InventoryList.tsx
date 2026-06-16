import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { Database, ListOrdered, Scale, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';

const transactionService = new CloudTransactionService();

interface InventoryListProps {
  selectedStation: any | null;
}

type TabType = 'tanks' | 'movements' | 'variances';

export const InventoryList: React.FC<InventoryListProps> = ({ selectedStation }) => {
  const [activeTab, setActiveTab] = useState<TabType>('tanks');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tanks, setTanks] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [variances, setVariances] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (selectedStation) {
      loadData();
    }
  }, [selectedStation]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tanksList, movementsList, variancesList] = await Promise.all([
        transactionService.getInventoryStatus(selectedStation.id),
        transactionService.getInventoryMovements(selectedStation.id),
        transactionService.getInventoryVariances(selectedStation.id),
      ]);
      setTanks(tanksList || []);
      setMovements(movementsList || []);
      setVariances(variancesList || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const [tanksList, movementsList, variancesList] = await Promise.all([
        transactionService.getInventoryStatus(selectedStation.id),
        transactionService.getInventoryMovements(selectedStation.id),
        transactionService.getInventoryVariances(selectedStation.id),
      ]);
      setTanks(tanksList || []);
      setMovements(movementsList || []);
      setVariances(variancesList || []);
    } catch (err: any) {
      console.error('Failed to refresh inventory:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px', fontFamily: 'var(--font-sans)' }}>
        Please select a station to view inventory.
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Loading inventory control panel..." />;
  }

  if (error) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: 'var(--state-danger-bg)',
        color: 'var(--state-danger-fg)',
        borderRadius: 'var(--radius-card)',
        fontFamily: 'var(--font-sans)',
      }}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Inventory Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Monitor tank stock levels, audit physical dip variances, and inspect fuel movements.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            height: '32px',
            padding: '0 12px',
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--border-soft)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-strong)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Tabs Selector */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-soft)',
        gap: '24px',
      }}>
        <button
          onClick={() => setActiveTab('tanks')}
          style={{
            padding: '12px 4px',
            fontSize: '14px',
            fontWeight: activeTab === 'tanks' ? 600 : 500,
            color: activeTab === 'tanks' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'tanks' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Database size={16} />
          Tank Status
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          style={{
            padding: '12px 4px',
            fontSize: '14px',
            fontWeight: activeTab === 'movements' ? 600 : 500,
            color: activeTab === 'movements' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'movements' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ListOrdered size={16} />
          Stock Movements Ledger
        </button>

        <button
          onClick={() => setActiveTab('variances')}
          style={{
            padding: '12px 4px',
            fontSize: '14px',
            fontWeight: activeTab === 'variances' ? 600 : 500,
            color: activeTab === 'variances' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'variances' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Scale size={16} />
          Physical Reconciliations
        </button>
      </div>

      {/* Tab Contents */}
      <div>
        {activeTab === 'tanks' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {tanks.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '12px 0' }}>No fuel tanks configured for this station.</div>
            ) : (
              tanks.map((tank) => {
                const percentage = Math.min(100, Math.max(0, (tank.currentVolume / tank.capacity) * 100));
                // Set color of progress bar based on capacity percentage
                // Low level: red/orange (under 15%), Warning: yellow (under 35%), Good: green/blue
                let progressColor = 'var(--primary)';
                if (percentage < 15) {
                  progressColor = 'var(--state-danger-fg)';
                } else if (percentage < 35) {
                  progressColor = 'var(--state-warning-fg)';
                } else {
                  progressColor = 'var(--state-success-fg)';
                }

                return (
                  <div key={tank.id} style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-card)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>{tank.name}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                          {tank.productName} ({tank.productCode})
                        </span>
                      </div>
                      <Database size={18} style={{ color: 'var(--text-muted)' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                      <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)' }}>
                        {tank.currentVolume.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>L</span>
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        of {tank.capacity.toLocaleString('en-IN')} L
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{
                        height: '6px',
                        backgroundColor: 'var(--border-soft)',
                        borderRadius: '3px',
                        width: '100%',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${percentage}%`,
                          backgroundColor: progressColor,
                          transition: 'width 0.4s ease',
                          borderRadius: '3px',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{percentage.toFixed(0)}% Capacity</span>
                        {percentage < 15 && (
                          <span style={{ color: 'var(--state-danger-fg)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <AlertTriangle size={10} /> Low Stock
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'movements' && (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', backgroundColor: 'rgba(0,0,0,0.01)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Date</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Product</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Movement Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)', textAlign: 'right' }}>Quantity</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Reference</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No stock movements recorded.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const isPositive = m.quantity > 0;
                    const qtyStyle = isPositive ? { color: 'var(--state-success-fg)', fontWeight: 600 } : { color: 'var(--text-strong)' };

                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                          {new Date(m.shiftDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-strong)' }}>
                          {m.productName}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor:
                              m.movementType === 'Purchase' ? 'var(--state-info-bg)' :
                              m.movementType === 'Sale' ? 'var(--border-soft)' :
                              m.movementType === 'Variance' ? 'var(--state-danger-bg)' : 'var(--border-soft)',
                            color:
                              m.movementType === 'Purchase' ? 'var(--state-info-fg)' :
                              m.movementType === 'Sale' ? 'var(--text-strong)' :
                              m.movementType === 'Variance' ? 'var(--state-danger-fg)' : 'var(--text-strong)',
                          }}>
                            {m.movementType}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', ...qtyStyle }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {Math.abs(m.quantity).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {m.referenceType ?? 'N/A'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {m.notes ?? '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'variances' && (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', backgroundColor: 'rgba(0,0,0,0.01)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Shift Date</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Product</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)', textAlign: 'right' }}>Expected Qty</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)', textAlign: 'right' }}>Actual Qty</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)', textAlign: 'right' }}>Variance</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>Reconciliation Reason</th>
                </tr>
              </thead>
              <tbody>
                {variances.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No reconciliation logs or physical variances logged yet.
                    </td>
                  </tr>
                ) : (
                  variances.map((v) => {
                    const diff = v.varianceQuantity;
                    const isSevere = Math.abs(diff) > 0.005 * v.expectedQuantity;
                    let diffColor = 'var(--text-strong)';
                    if (diff < 0) {
                      diffColor = 'var(--state-danger-fg)';
                    } else if (diff > 0) {
                      diffColor = 'var(--state-success-fg)';
                    }

                    return (
                      <tr key={v.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                          {new Date(v.shiftDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-strong)' }}>
                          {v.productName}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {v.expectedQuantity.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-strong)' }}>
                          {v.actualQuantity.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: diffColor, fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} L
                            {isSevere && <AlertTriangle size={12} style={{ color: 'var(--state-warning-fg)' }} />}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {v.reason ?? 'Reconciliation run'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
