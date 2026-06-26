import React, { useEffect, useState } from 'react';
import { Calendar, Eye, FileText, RefreshCw } from 'lucide-react';
import { CloudShiftService } from '../../services/cloud.js';
import { StatusBadge } from '../StatusBadge.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { ShiftSummaryView } from './ShiftSummaryView.js';

const shiftService = new CloudShiftService();

interface ShiftHistoryTabProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  viewShiftId?: string | null;
  onClearViewShiftId?: () => void;
}

export const ShiftHistoryTab: React.FC<ShiftHistoryTabProps> = ({
  selectedStation,
  userRole,
  viewShiftId,
  onClearViewShiftId,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [activeSummary, setActiveSummary] = useState<any | null>(null);

  const loadSummaries = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
      const list = await shiftService.getShiftSummaries(selectedStation.id);
      setSummaries(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load shift history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStation) {
      loadSummaries();
    }
  }, [selectedStation]);

  useEffect(() => {
    if (viewShiftId && summaries.length > 0) {
      const match = summaries.find((d) => d.shiftId === viewShiftId);
      if (match) {
        setActiveSummary(match);
      }
    }
  }, [viewShiftId, summaries]);

  const handleBack = () => {
    setActiveSummary(null);
    if (onClearViewShiftId) {
      onClearViewShiftId();
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view shift history.
      </div>
    );
  }

  if (loading && summaries.length === 0) {
    return <LoadingSpinner text="Retrieving shift history..." />;
  }

  if (activeSummary) {
    const canReopen =
      (userRole === 'Owner' || userRole === 'Manager') &&
      activeSummary.shiftStatus === 'CLOSED';

    return (
      <div className="animate-fade-in">
        <ShiftSummaryView
          shiftSummary={activeSummary}
          userRole={userRole}
          canReopen={canReopen}
          shiftStatus={activeSummary.shiftStatus}
          onReopenSuccess={() => {
            loadSummaries();
            handleBack();
          }}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Shift History
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
            Closed and locked shift snapshots for this station.
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={loadSummaries}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            borderRadius: 'var(--radius-card)',
            fontSize: '13px',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                borderBottom: '1px solid var(--border-soft)',
                textAlign: 'left',
                color: 'var(--text-muted)',
              }}
            >
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Closure Date</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Template</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Reconciled By</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Expected (₹)</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Actual (₹)</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Variance (₹)</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {summaries.length > 0 ? (
              summaries.map((d) => {
                const data = d.snapshotData || {};
                const variance = Number(data.cashVariance || 0);
                const expected = Number(data.expectedCash || 0);
                const actual = Number(data.closingCash || 0);
                const date = new Date(d.generatedAt).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                let varColor = 'var(--text-strong)';
                if (variance < 0) {
                  varColor = 'var(--brand-danger)';
                } else if (variance > 0) {
                  varColor = 'var(--brand-warning)';
                } else {
                  varColor = 'var(--state-success-fg)';
                }

                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                        {date}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-default)' }}>
                      {data.templateName || 'Custom'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge
                        status={d.shiftStatus}
                        type={d.shiftStatus === 'LOCKED' ? 'default' : 'success'}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-default)' }}>
                      {data.closedByName || 'Unknown'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{expected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{actual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: varColor,
                      }}
                    >
                      {variance > 0 ? '+' : ''}
                      ₹{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '6px 16px', textAlign: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActiveSummary(d)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={12} />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <FileText size={32} style={{ color: 'var(--text-faint)' }} />
                    <div>
                      <h4 style={{ fontWeight: 600, color: 'var(--text-strong)' }}>No Closed Shifts Yet</h4>
                      <p style={{ fontSize: '12px', marginTop: '4px' }}>
                        Close an active shift to generate your first shift summary.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
