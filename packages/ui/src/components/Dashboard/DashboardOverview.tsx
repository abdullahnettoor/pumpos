import React, { useEffect, useState } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import { StatusBadge } from '../StatusBadge.js';
import { SyncIndicator } from '../SyncIndicator.js';
import { Station, ShiftDashboardSummary } from '@pump/shared';

const shiftService = new CloudShiftService();

interface DashboardOverviewProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  onNavigate: (path: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  selectedStation,
  userRole,
  userName,
  onNavigate,
}) => {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
  const [isReopening, setIsReopening] = useState(false);

  useEffect(() => {
    if (selectedStation) {
      loadDashboardData();
    }
  }, [selectedStation]);

  const loadDashboardData = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
      const data = await shiftService.getShiftStatus(selectedStation.id);
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to load dashboard shifts status:', err);
      setError(err.message || 'Failed to retrieve active shifts status');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = () => {
    setSyncStatus('pending');
    setTimeout(() => {
      setSyncStatus('synced');
    }, 1200);
  };

  const handleReopen = async (shiftId: string) => {
    if (!window.confirm('Are you sure you want to reopen this shift? This will delete the generated DSSR snapshot and set the shift state back to OPEN.')) {
      return;
    }
    try {
      setIsReopening(true);
      await shiftService.reopenShift(shiftId);
      onNavigate('/shifts');
    } catch (err: any) {
      alert(err.message || 'Failed to reopen shift');
    } finally {
      setIsReopening(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', padding: '24px' }}>
        No station selected. Please configure or select a station to continue.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        Loading operational summary metrics...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: 'var(--state-danger-bg)',
        color: 'var(--state-danger-fg)',
        borderRadius: 'var(--radius-card)',
        fontFamily: 'var(--font-sans)',
        fontSize: '13px'
      }}>
        <strong>Error:</strong> {error}
        <button
          onClick={loadDashboardData}
          style={{
            display: 'block',
            marginTop: '12px',
            padding: '6px 12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-button)',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Retry Load
        </button>
      </div>
    );
  }

  const { activeShift, lastShift, lastDssr, canReopenLastShift, gracePeriodExpiresAt } = summary || {};
  const isAccountant = userRole === 'Accountant';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      {/* Top Welcome Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Welcome back, {userName}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Station Control Center: <strong style={{ color: 'var(--text-default)' }}>{selectedStation.name}</strong> ({selectedStation.code})
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <SyncIndicator status={syncStatus === 'pending' ? 'pending' : 'synced'} pendingCount={syncStatus === 'pending' ? 1 : 0} />
          <button
            onClick={handleSync}
            style={{
              height: '32px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-default)',
              borderRadius: 'var(--radius-button)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔄 Sync Status
          </button>
        </div>
      </div>

      {/* Main Grid: Launch Surfaces */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Active Shift Card */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '24px',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '180px',
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Shift Operations
              </span>
              {activeShift ? (
                <StatusBadge status="ACTIVE" type="success" />
              ) : (
                <StatusBadge status="NO ACTIVE SHIFT" type="warning" />
              )}
            </div>

            {activeShift ? (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {activeShift.templateName} Shift
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                  Opened by {activeShift.openedByName} at {new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
                  <span>Opening Cash: <strong>₹{Number(activeShift.openingCash).toLocaleString('en-IN')}</strong></span>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-default)' }}>
                  Ready to Record Operations
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                  Start a new shift template to record nozzle readings and assign staff.
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
            {activeShift ? (
              <button
                onClick={() => onNavigate('/shifts')}
                style={{
                  width: '100%',
                  height: '38px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                ⛽ Resume Shift Workspace
              </button>
            ) : (
              <button
                onClick={() => onNavigate('/shifts')}
                disabled={isAccountant}
                style={{
                  width: '100%',
                  height: '38px',
                  backgroundColor: isAccountant ? 'var(--bg-surface-alt)' : 'var(--brand-primary)',
                  color: isAccountant ? 'var(--text-muted)' : 'white',
                  border: isAccountant ? '1px solid var(--border-soft)' : 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isAccountant ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {isAccountant ? '🔒 Accountants Cannot Open Shifts' : '➕ Open Shift'}
              </button>
            )}
          </div>
        </div>

        {/* Latest DSSR Output Card */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '24px',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '180px',
        }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Authoritative Outputs (DSSR)
            </span>

            {lastShift ? (
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
                    Last {lastShift.templateName} Shift
                  </h3>
                  <StatusBadge status={lastShift.status} type={lastShift.status === 'LOCKED' ? 'default' : 'warning'} />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                  Closed at: {new Date(lastShift.closedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </p>

                {lastDssr && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: '12px', fontSize: '12px', color: 'var(--text-default)' }}>
                    <div>Total Fuel Sold: <strong>{Number(lastDssr.snapshotData.totalVolumeSold).toFixed(2)} L</strong></div>
                    <div>Closing Cash: <strong>₹{Number(lastDssr.snapshotData.closingCash).toLocaleString('en-IN')}</strong></div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  No historical reports yet
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                  Complete a shift closure to automatically compile the Daily Sales Summary Record.
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            {lastShift && (
              <>
                <button
                  onClick={() => onNavigate('/shifts')}
                  style={{
                    flex: 1,
                    height: '34px',
                    backgroundColor: 'var(--bg-surface-alt)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-strong)',
                    borderRadius: 'var(--radius-button)',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  📄 View Last DSSR
                </button>

                {canReopenLastShift && (
                  <button
                    onClick={() => handleReopen(lastShift.id)}
                    disabled={isReopening}
                    style={{
                      flex: 1,
                      height: '34px',
                      backgroundColor: 'var(--state-danger-bg)',
                      border: '1px solid var(--border-soft)',
                      color: 'var(--state-danger-fg)',
                      borderRadius: 'var(--radius-button)',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {isReopening ? 'Reopening...' : '🔓 Reopen'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      {/* Grace period remaining countdown notification */}
      {gracePeriodExpiresAt && canReopenLastShift && (
        <div style={{
          backgroundColor: 'var(--bg-surface-alt)',
          border: '1px solid var(--border-soft)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
          color: 'var(--text-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <span>
            ⚠️ <strong>Reopen Window Active:</strong> You can reopen the recently closed shift until{' '}
            <strong>{new Date(gracePeriodExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>.
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Grace Timer Running
          </span>
        </div>
      )}
    </div>
  );
};
