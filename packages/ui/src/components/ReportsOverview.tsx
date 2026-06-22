import React, { useEffect, useState } from 'react';
import { CloudShiftService } from '../services/cloud.js';
import { DssrView } from './Shifts/DssrView.js';
import { StatusBadge } from './StatusBadge.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { FileText, Calendar, Eye, RefreshCw } from 'lucide-react';

const shiftService = new CloudShiftService();

interface ReportsOverviewProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  viewDssrShiftId?: string | null;
  onClearViewDssrShiftId?: () => void;
}

export const ReportsOverview: React.FC<ReportsOverviewProps> = ({
  selectedStation,
  userRole,
  viewDssrShiftId,
  onClearViewDssrShiftId,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dssrs, setDssrs] = useState<any[]>([]);
  const [activeDssr, setActiveDssr] = useState<any | null>(null);

  useEffect(() => {
    if (selectedStation) {
      loadDssrs();
    }
  }, [selectedStation]);

  useEffect(() => {
    // If a specific shiftId is requested for viewing, auto-select it from loaded list
    if (viewDssrShiftId && dssrs.length > 0) {
      const match = dssrs.find((d) => d.shiftId === viewDssrShiftId);
      if (match) {
        setActiveDssr(match);
      }
    }
  }, [viewDssrShiftId, dssrs]);

  const loadDssrs = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
      const list = await shiftService.getDssrs(selectedStation.id);
      setDssrs(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load historical reports');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setActiveDssr(null);
    if (onClearViewDssrShiftId) {
      onClearViewDssrShiftId();
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view reports.
      </div>
    );
  }

  if (loading && dssrs.length === 0) {
    return <LoadingSpinner text="Retrieving historical compiled DSSR logs..." />;
  }

  // Render detail view if a DSSR is active
  if (activeDssr) {
    // A shift can be reopened if the user has Manager/Owner role and the shift is CLOSED (not LOCKED)
    const canReopen =
      (userRole === 'Owner' || userRole === 'Manager') &&
      activeDssr.shiftStatus === 'CLOSED';

    return (
      <div className="animate-fade-in">
        <DssrView
          dssr={activeDssr}
          userRole={userRole}
          canReopen={canReopen}
          shiftStatus={activeDssr.shiftStatus}
          onReopenSuccess={() => {
            loadDssrs();
            handleBack();
          }}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Daily Sales Summary Records (DSSR)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Historical audit logs and cash reconciliation reports compiled at shift closures.
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={loadDssrs}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Registry
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)', fontSize: '13px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Historical List Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '12px 20px', fontWeight: 600 }}>Closure Date</th>
              <th style={{ padding: '12px 20px', fontWeight: 600 }}>Shift Template</th>
              <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '12px 20px', fontWeight: 600 }}>Reconciled By</th>
              <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Expected Cash (₹)</th>
              <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Actual Cash (₹)</th>
              <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Variance (₹)</th>
              <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dssrs.length > 0 ? (
              dssrs.map((d) => {
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
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                        {date}
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-default)' }}>
                      {data.templateName || 'Custom'}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <StatusBadge
                        status={d.shiftStatus}
                        type={d.shiftStatus === 'LOCKED' ? 'default' : 'success'}
                      />
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-default)' }}>
                      {data.closedByName || 'Unknown'}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{expected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{actual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: varColor }}>
                      {variance > 0 ? '+' : ''}₹{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px 20px', textAlign: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActiveDssr(d)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={12} />
                        View Report
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
                      <h4 style={{ fontWeight: 600, color: 'var(--text-strong)' }}>No Compiled DSSR Snapshots</h4>
                      <p style={{ fontSize: '12px', marginTop: '4px' }}>Close an active operational shift template to compile your first daily sales snapshot.</p>
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
