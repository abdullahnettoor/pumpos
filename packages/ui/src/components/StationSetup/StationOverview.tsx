import React, { useState, useEffect } from 'react';
import { CloudStationService } from '../../services/cloud.js';
import { Station } from '@pump/shared';
import { ProductsCatalog } from './ProductsCatalog.js';
import { FuelPricingPanel } from './FuelPricingPanel.js';
import { TanksGrid } from './TanksGrid.js';
import { DispensersList } from './DispensersList.js';
import { ShiftTemplates } from './ShiftTemplates.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { UserRolesAssignment } from './UserRolesAssignment.js';

const stationService = new CloudStationService();

export interface StationOverviewProps {
  onStationSelected: (station: Station | null) => void;
  selectedStation: Station | null;
}

export const StationOverview: React.FC<StationOverviewProps> = ({
  onStationSelected,
  selectedStation,
}) => {
  const [stationsList, setStationsList] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'products' | 'pricing' | 'tanks' | 'dispensers' | 'shifts' | 'roster'>('general');

  // General tab form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [onboardingStatus, setOnboardingStatus] = useState<string>('NOT_STARTED');

  useEffect(() => {
    loadStations();
  }, []);

  useEffect(() => {
    if (selectedStation) {
      setName(selectedStation.name);
      setCode(selectedStation.code);
      setAddress(selectedStation.address || '');
      setPhone(selectedStation.phone || '');
      setGraceMinutes(selectedStation.settings?.shift_grace_minutes || 15);
      setOnboardingStatus(selectedStation.onboardingStatus || 'NOT_STARTED');
    }
  }, [selectedStation]);

  const loadStations = async () => {
    try {
      setLoading(true);
      const list = await stationService.getStations();
      setStationsList(list);
      if (list.length > 0 && !selectedStation) {
        onStationSelected(list[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;

    try {
      const updated = await stationService.updateStation(selectedStation.id, {
        name,
        code: code.toUpperCase(),
        address,
        phone,
        settings: {
          ...(selectedStation.settings || {}),
          shift_grace_minutes: graceMinutes,
          shift_lock_grace_days: selectedStation.settings?.shift_lock_grace_days || 3,
          offline_warning_days: selectedStation.settings?.offline_warning_days || 3,
          offline_critical_days: selectedStation.settings?.offline_critical_days || 7,
        },
        onboardingStatus
      });
      onStationSelected(updated);
      setEditing(false);
      loadStations();
    } catch (err: any) {
      alert(err.message);
    }
  };



  if (loading) {
    return <LoadingSpinner text="Loading station overview..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="animate-fade-in">
      
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Station Setup & Administration</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Review and modify station components, products, tanks, nozzles, and settings.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={selectedStation?.id || ''}
            onChange={(e) => {
              const found = stationsList.find((s) => s.id === e.target.value);
              onStationSelected(found || null);
            }}
            style={{
              padding: '0 8px',
              height: '32px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-input)',
              fontSize: '13px',
              color: 'var(--text-strong)',
              cursor: 'pointer'
            }}
          >
            <option value="">Select Location</option>
            {stationsList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

        </div>
      </div>

      {selectedStation ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Tabs bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-soft)', gap: '16px', overflowX: 'auto' }}>
            {[
              { id: 'general', label: 'General Info' },
              { id: 'products', label: 'Products Catalog' },
              { id: 'pricing', label: 'Fuel Pricing' },
              { id: 'tanks', label: 'Storage Tanks' },
              { id: 'dispensers', label: 'Dispenser Units' },
              { id: 'shifts', label: 'Shift Templates' },
              { id: 'roster', label: 'Team Roster' }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    padding: '8px 12px 12px 12px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: isActive ? 'var(--brand-primary)' : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '13px',
                    borderBottom: isActive ? '2px solid var(--brand-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-card)', border: '1px solid var(--border-soft)', minHeight: '350px' }}>
            {activeTab === 'general' && (
              <div>
                {editing ? (
                  <form onSubmit={handleSaveGeneral} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label className="form-label">Station Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Station Code</label>
                        <input
                          type="text"
                          className="form-input"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Physical Address</label>
                      <input
                        type="text"
                        className="form-input"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label className="form-label">Contact Phone</label>
                        <input
                          type="text"
                          className="form-input"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Shift Grace Period (Minutes)</label>
                        <input
                          type="number"
                          className="form-input mono-num"
                          value={graceMinutes}
                          onChange={(e) => setGraceMinutes(parseInt(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ maxWidth: '300px' }}>
                      <label className="form-label">Onboarding Readiness Status</label>
                      <select
                        value={onboardingStatus}
                        onChange={(e) => setOnboardingStatus(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="NOT_STARTED">NOT STARTED</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="READY_FOR_OPERATIONS">READY FOR OPERATIONS</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                      >
                        Save Configuration
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>{selectedStation.name}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status: <strong style={{ color: onboardingStatus === 'READY_FOR_OPERATIONS' ? 'var(--state-success-fg)' : 'var(--state-warning-fg)' }}>{onboardingStatus.replace(/_/g, ' ')}</strong></p>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditing(true)}
                      >
                        Edit General Parameters
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location Code</span>
                        <p style={{ fontSize: '14px', fontWeight: 600, marginTop: '4px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{selectedStation.code}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact</span>
                        <p style={{ fontSize: '13px', fontWeight: 500, marginTop: '4px', color: 'var(--text-default)' }}>{selectedStation.phone || '—'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grace Period</span>
                        <p style={{ fontSize: '13px', fontWeight: 500, marginTop: '4px', color: 'var(--text-default)', fontFamily: 'var(--font-mono)' }}>
                          {selectedStation.settings?.shift_grace_minutes || 15} min
                        </p>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Address</span>
                        <p style={{ fontSize: '13px', fontWeight: 500, marginTop: '4px', color: 'var(--text-default)' }}>{selectedStation.address || '—'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'products' && <ProductsCatalog />}
            {activeTab === 'pricing' && <FuelPricingPanel selectedStation={selectedStation} />}
            {activeTab === 'tanks' && <TanksGrid stationId={selectedStation.id} />}
            {activeTab === 'dispensers' && <DispensersList stationId={selectedStation.id} />}
            {activeTab === 'shifts' && <ShiftTemplates />}
            {activeTab === 'roster' && <UserRolesAssignment />}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border-soft)' }}>
          Please select or initialize a station location first.
        </div>
      )}
    </div>
  );
};
