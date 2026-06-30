import React, { useEffect, useState } from 'react';
import { CloudShiftService } from '../services/cloud.js';
import { DailyDssrView } from './DailyDssrView.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Tabs } from './primitives/Tabs.js';
import { PageLayout } from './primitives/PageLayout.js';
import { Calendar, RefreshCw, Play, Zap, Layers } from 'lucide-react';

const shiftService = new CloudShiftService();

// Custom Reports is not built yet; gate the placeholder tab off until it ships.
const SHOW_CUSTOM_REPORTS = false;

interface ReportsOverviewProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
}

type ReportsTab = 'daily-dssr' | 'custom-reports';

export const ReportsOverview: React.FC<ReportsOverviewProps> = ({
  selectedStation,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportsTab>('daily-dssr');

  // Daily DSSR states
  const [dailyDssrList, setDailyDssrList] = useState<any[]>([]);
  const [activeDailyDssr, setActiveDailyDssr] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [generatingDailyDssr, setGeneratingDailyDssr] = useState(false);

  useEffect(() => {
    if (selectedStation && activeTab === 'daily-dssr') {
      loadDailyDssrs();
    }
  }, [selectedStation, activeTab]);

  const loadDailyDssrs = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
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

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view reports.
      </div>
    );
  }

  if (loading && dailyDssrList.length === 0 && activeTab === 'daily-dssr') {
    return <LoadingSpinner text="Retrieving reports..." />;
  }

  if (activeDailyDssr) {
    return (
      <div className="animate-fade-in">
        <DailyDssrView
          dailyDssr={activeDailyDssr}
          station={selectedStation}
          onBack={() => {
            setActiveDailyDssr(null);
            loadDailyDssrs();
          }}
        />
      </div>
    );
  }

  return (
    <PageLayout
      title="Reports"
      subtitle="Daily sales summaries and custom reporting. Per-shift summaries are in the Shift tab → History."
      actions={activeTab === 'daily-dssr' ? (
        <button
          className="btn btn-secondary btn-sm"
          onClick={loadDailyDssrs}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      ) : undefined}
      toolbar={SHOW_CUSTOM_REPORTS ? (
        <Tabs
          aria-label="Reports"
          style={{ width: '100%' }}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as ReportsTab)}
          tabs={[
            { id: 'daily-dssr', label: 'Daily DSSR', icon: <Zap size={13} /> },
            { id: 'custom-reports', label: 'Custom Reports', icon: <Layers size={13} /> },
          ]}
        />
      ) : undefined}
    >

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

      {/* Daily DSSR Tab */}
      {activeTab === 'daily-dssr' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Generate Controls */}
          <div
            className="card"
            style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-end' }}
          >
            <div style={{ flex: 1, maxWidth: '260px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Business Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
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
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--border-soft)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              display: 'block',
                              fontWeight: 600,
                              marginBottom: '4px',
                            }}
                          >
                            BUSINESS DATE
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>
                            <Calendar size={12} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                            {d.businessDate}
                          </strong>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              display: 'block',
                              fontWeight: 600,
                              marginBottom: '4px',
                            }}
                          >
                            SHIFTS INCLUDED
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>
                            {data.shiftsIncluded || 0}
                          </strong>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              display: 'block',
                              fontWeight: 600,
                              marginBottom: '4px',
                            }}
                          >
                            TOTAL VOLUME SOLD
                          </span>
                          <strong
                            style={{
                              fontSize: '14px',
                              color: 'var(--text-strong)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {Number(data.totalVolumeSold || 0).toFixed(2)} L
                          </strong>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              display: 'block',
                              fontWeight: 600,
                              marginBottom: '4px',
                            }}
                          >
                            TOTAL COLLECTIONS
                          </span>
                          <strong
                            style={{
                              fontSize: '14px',
                              color: 'var(--state-success-fg)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            ₹{Number(data.totalCashCollections || 0).toLocaleString('en-IN')}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <Zap size={32} style={{ color: 'var(--text-faint)' }} />
                  <div>
                    <h4 style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                      No Daily DSSR Reports
                    </h4>
                    <p style={{ fontSize: '12px', marginTop: '4px' }}>
                      Generate a daily snapshot or select a date above to get started.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Reports Tab (placeholder) */}
      {SHOW_CUSTOM_REPORTS && activeTab === 'custom-reports' && (
        <div
          className="card"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Layers size={32} style={{ color: 'var(--text-faint)' }} />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Custom Reports Coming Soon
            </h3>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                marginTop: '4px',
                maxWidth: '460px',
              }}
            >
              Configurable date-range reports for sales, expenses, variance trends, customer
              ledgers, fuel throughput, and GST exports.
            </p>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
