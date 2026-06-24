import React, { useEffect, useState } from 'react';
import { CloudShiftService } from '../services/cloud.js';
import { ShiftSummaryView } from './Shifts/ShiftSummaryView.js';
import { DailyDssrView } from './DailyDssrView.js';
import { StatusBadge } from './StatusBadge.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { FileText, Calendar, Eye, RefreshCw, Play, Zap } from 'lucide-react';

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

  // Daily DSSR states
  const [activeTab, setActiveTab] = useState<'shift-summaries' | 'daily-dssr'>('shift-summaries');
  const [dailyDssrList, setDailyDssrList] = useState<any[]>([]);
  const [activeDailyDssr, setActiveDailyDssr] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [generatingDailyDssr, setGeneratingDailyDssr] = useState(false);

  useEffect(() => {
    if (selectedStation) {
      if (activeTab === 'shift-summaries') {
        loadShiftSummaries();
      } else {
        loadDailyDssrs();
      }
    }
  }, [selectedStation, activeTab]);

  useEffect(() => {
    // If a specific shiftId is requested for viewing, auto-select it from loaded list
    if (viewDssrShiftId && dssrs.length > 0) {
      const match = dssrs.find((d) => d.shiftId === viewDssrShiftId);
      if (match) {
        setActiveDssr(match);
      }
    }
  }, [viewDssrShiftId, dssrs]);

  const loadShiftSummaries = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
      const list = await shiftService.getShiftSummaries(selectedStation.id);
      setDssrs(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load historical reports');
    } finally {
      setLoading(false);
    }
  };

  const loadDailyDssrs = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
      // Load last 30 days
      const toDate = new Date();
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 30);
      
      const from = fromDate.toISOString().split('T')[0];
      const to = toDate.toISOString().split('T')[0];
      
      const list = await shiftService.getDailyDssrRange(selectedStation.id, from, to);
      setDailyDssrList(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load daily DSSR reports');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDailyDssr = async () => {
    if (!selectedStation || !selectedDate) return;
    try {
      setGeneratingDailyDssr(true);
      setError(null);
      const result = await shiftService.generateDailyDssr(selectedStation.id, selectedDate);
      setActiveDailyDssr(result);
      await loadDailyDssrs();
    } catch (err: any) {
      setError(err.message || 'Failed to generate daily DSSR');
    } finally {
      setGeneratingDailyDssr(false);
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

  if (loading && dssrs.length === 0 && dailyDssrList.length === 0) {
    return <LoadingSpinner text="Retrieving historical reports..." />;
  }

  // Render detail view if a DSSR is active
  if (activeDssr) {
    // A shift can be reopened if the user has Manager/Owner role and the shift is CLOSED (not LOCKED)
    const canReopen =
      (userRole === 'Owner' || userRole === 'Manager') &&
      activeDssr.shiftStatus === 'CLOSED';

    return (
      <div className="animate-fade-in">
        <ShiftSummaryView
          shiftSummary={activeDssr}
          userRole={userRole}
          canReopen={canReopen}
          shiftStatus={activeDssr.shiftStatus}
          onReopenSuccess={() => {
            loadShiftSummaries();
            handleBack();
          }}
          onBack={handleBack}
        />
      </div>
    );
  }

  if (activeDailyDssr) {
    return (
      <div className="animate-fade-in">
        <DailyDssrView
          dailyDssr={activeDailyDssr}
          onBack={() => {
            setActiveDailyDssr(null);
            loadDailyDssrs();
          }}
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
            Reports & Reconciliation
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Historical audit logs and daily sales summary snapshots.
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (activeTab === 'shift-summaries') {
              loadShiftSummaries();
            } else {
              loadDailyDssrs();
            }
          }}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-soft)', paddingBottom: '0' }}>
        <button
          onClick={() => setActiveTab('shift-summaries')}
          style={{
            padding: '12px 20px',
            backgroundColor: 'transparent',
            borderBottom: activeTab === 'shift-summaries' ? '2px solid var(--brand-primary)' : '2px solid transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            color: activeTab === 'shift-summaries' ? 'var(--brand-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'shift-summaries' ? 600 : 400,
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '-1px',
            transition: 'all 0.2s ease',
          }}
        >
          <FileText size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
          Shift Summaries
        </button>
        <button
          onClick={() => setActiveTab('daily-dssr')}
          style={{
            padding: '12px 20px',
            backgroundColor: 'transparent',
            borderBottom: activeTab === 'daily-dssr' ? '2px solid var(--brand-primary)' : '2px solid transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            color: activeTab === 'daily-dssr' ? 'var(--brand-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'daily-dssr' ? 600 : 400,
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '-1px',
            transition: 'all 0.2s ease',
          }}
        >
          <Zap size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
          Daily DSSR
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)', fontSize: '13px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Shift Summaries Tab */}
      {activeTab === 'shift-summaries' && (
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
                        <h4 style={{ fontWeight: 600, color: 'var(--text-strong)' }}>No Compiled Shift Summaries</h4>
                        <p style={{ fontSize: '12px', marginTop: '4px' }}>Close an active operational shift template to compile your first daily sales snapshot.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Daily DSSR Tab */}
      {activeTab === 'daily-dssr' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Generate Controls */}
          <div className="card" style={{ padding: '20px', display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Business Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)',
                }}
              />
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleGenerateDailyDssr}
              disabled={generatingDailyDssr || !selectedDate}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Play size={13} style={{ fill: 'currentColor' }} />
              {generatingDailyDssr ? 'Generating...' : 'Generate DSSR'}
            </button>
          </div>

          {/* Daily DSSR List */}
          <div className="card" style={{ overflow: 'hidden' }}>
            {dailyDssrList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {dailyDssrList.map((d) => {
                  const data = d.snapshotData || {};

                  return (
                    <div
                      key={d.id}
                      onClick={() => setActiveDailyDssr(d)}
                      style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border-soft)',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                            BUSINESS DATE
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>
                            {d.businessDate}
                          </strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                            SHIFTS INCLUDED
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>
                            {data.shiftsIncluded || 0}
                          </strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                            TOTAL VOLUME SOLD
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                            {Number(data.totalVolumeSold || 0).toFixed(2)} L
                          </strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600, marginBottom: '4px' }}>
                            TOTAL COLLECTIONS
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
                            ₹{Number(data.totalCashCollections || 0).toLocaleString('en-IN')}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Zap size={32} style={{ color: 'var(--text-faint)' }} />
                  <div>
                    <h4 style={{ fontWeight: 600, color: 'var(--text-strong)' }}>No Daily DSSR Reports</h4>
                    <p style={{ fontSize: '12px', marginTop: '4px' }}>Generate a daily snapshot or select a date above to get started.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
