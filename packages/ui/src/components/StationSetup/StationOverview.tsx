import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudStationService } from '../../services/cloud.js';
import { queryKeys } from '../../query/hooks.js';
import { Station } from '@pump/shared';
import { ProductsCatalog } from './ProductsCatalog.js';
import { TanksGrid } from './TanksGrid.js';
import { DispensersList } from './DispensersList.js';
import { ShiftTemplates } from './ShiftTemplates.js';
import { Tabs } from '../primitives/Tabs.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { UserRolesAssignment } from './UserRolesAssignment.js';
import { PaymentTerminalsPanel } from './PaymentTerminalsPanel.js';
import { DEFAULT_SHIFT_SUMMARY_CONFIG, SHIFT_SUMMARY_SECTION_LABELS, DEFAULT_DSSR_CONFIG, DSSR_SECTION_LABELS } from '../../services/reports/reportConfig.js';

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
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'products' | 'tanks' | 'dispensers' | 'terminals' | 'shifts' | 'roster'>('general');

  // General tab form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [businessDayStartsAt, setBusinessDayStartsAt] = useState('06:00');
  // Legal / branding (letterhead for reports & invoices)
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [legalAddress, setLegalAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [roCode, setRoCode] = useState('');
  const [fuelBrand, setFuelBrand] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [ssEnabled, setSsEnabled] = useState<Set<string>>(new Set(DEFAULT_SHIFT_SUMMARY_CONFIG.sections));
  const [dssrEnabled, setDssrEnabled] = useState<Set<string>>(new Set(DEFAULT_DSSR_CONFIG.sections));
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
      setTimezone(selectedStation.settings?.timezone || 'Asia/Kolkata');
      setBusinessDayStartsAt(selectedStation.settings?.business_day_starts_at || '06:00');
      const legal = selectedStation.settings?.legal || {};
      setLegalName(legal.legalName || '');
      setGstin(legal.gstin || '');
      setStateCode(legal.stateCode || '');
      setLegalAddress(legal.addressLine || '');
      setPincode(legal.pincode || '');
      setRoCode(legal.roCode || '');
      setFuelBrand(selectedStation.settings?.fuel_brand || '');
      setLogoDataUrl(selectedStation.settings?.logo_data_url || null);
      const rc = selectedStation.settings?.report_config || {};
      setSsEnabled(new Set(rc.shiftSummary?.length ? rc.shiftSummary : DEFAULT_SHIFT_SUMMARY_CONFIG.sections));
      setDssrEnabled(new Set(rc.dssr?.length ? rc.dssr : DEFAULT_DSSR_CONFIG.sections));
      setOnboardingStatus(selectedStation.onboardingStatus || 'NOT_STARTED');
    }
  }, [selectedStation]);

  const loadStations = async (force = false) => {
    try {
      setLoading(true);
      if (force) await qc.invalidateQueries({ queryKey: queryKeys.stations() });
      // Shared cache: repeat visits within staleTime serve from cache (+ localStorage)
      // instead of re-hitting /setup/stations on every mount.
      const list = await qc.fetchQuery({
        queryKey: queryKeys.stations(),
        queryFn: () => stationService.getStations(),
        staleTime: 24 * 60 * 60_000,
      });
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
          timezone,
          business_day_starts_at: businessDayStartsAt,
          legal: {
            legalName: legalName || null,
            gstin: gstin || null,
            stateCode: stateCode || null,
            addressLine: legalAddress || null,
            pincode: pincode || null,
            roCode: roCode || null,
          },
          fuel_brand: fuelBrand || null,
          logo_data_url: logoDataUrl || null,
          report_config: {
            shiftSummary: DEFAULT_SHIFT_SUMMARY_CONFIG.sections.filter((k) => ssEnabled.has(k)),
            dssr: DEFAULT_DSSR_CONFIG.sections.filter((k) => dssrEnabled.has(k)),
          },
          shift_lock_grace_days: selectedStation.settings?.shift_lock_grace_days || 3,
          offline_warning_days: selectedStation.settings?.offline_warning_days || 3,
          offline_critical_days: selectedStation.settings?.offline_critical_days || 7,
        },
        onboardingStatus
      });
      onStationSelected(updated);
      setEditing(false);
      loadStations(true);
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
          <Tabs
            aria-label="Station setup"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as any)}
            tabs={[
              { id: 'general', label: 'General Info' },
              { id: 'products', label: 'Products Catalog' },
              { id: 'tanks', label: 'Storage Tanks' },
              { id: 'dispensers', label: 'Dispenser Units' },
              { id: 'terminals', label: 'Payment Terminals' },
              { id: 'shifts', label: 'Shift Templates' },
              { id: 'roster', label: 'Team Roster' },
            ]}
          />

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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label className="form-label">Timezone</label>
                        <select
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          style={{ width: '100%' }}
                        >
                          <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                          <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                          <option value="Asia/Colombo">Asia/Colombo</option>
                          <option value="Asia/Kathmandu">Asia/Kathmandu</option>
                          <option value="Asia/Dhaka">Asia/Dhaka</option>
                          <option value="UTC">UTC</option>
                        </select>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Used to decide which calendar day operations belong to.
                        </span>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Business Day Starts At</label>
                        <input
                          type="time"
                          className="form-input mono-num"
                          value={businessDayStartsAt}
                          onChange={(e) => setBusinessDayStartsAt(e.target.value)}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          A fuel day commonly runs 06:00 → 06:00. Activity before this rolls to the previous day.
                        </span>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '10px' }}>
                        Legal &amp; Branding (Report Letterhead)
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="form-group">
                          <label className="form-label">Legal / Trade Name</label>
                          <input className="form-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Sri Lakshmi Fuels" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">GSTIN</label>
                          <input className="form-input mono-num" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" maxLength={15} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">State Code (place of supply)</label>
                          <input className="form-input mono-num" value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="e.g. 29 (Karnataka)" maxLength={2} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Retail Outlet / Dealer Code</label>
                          <input className="form-input" value={roCode} onChange={(e) => setRoCode(e.target.value)} placeholder="RO / dealership code" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Address Line</label>
                          <input className="form-input" value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} placeholder="Street, area, city" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Pincode</label>
                          <input className="form-input mono-num" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="560001" maxLength={6} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Fuel Company / Brand</label>
                          <select value={fuelBrand} onChange={(e) => setFuelBrand(e.target.value)} style={{ width: '100%' }}>
                            <option value="">— Select —</option>
                            <option value="Indian Oil">Indian Oil (IOCL)</option>
                            <option value="Bharat Petroleum">Bharat Petroleum (BPCL)</option>
                            <option value="Hindustan Petroleum">Hindustan Petroleum (HPCL)</option>
                            <option value="Nayara Energy">Nayara Energy</option>
                            <option value="Jio-bp">Jio-bp (Reliance)</option>
                            <option value="Shell">Shell</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Logo (optional, your own)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {logoDataUrl && <img src={logoDataUrl} alt="logo" style={{ width: 36, height: 36, objectFit: 'contain', border: '1px solid var(--border-soft)', borderRadius: 4 }} />}
                            <input
                              type="file"
                              accept="image/png,image/jpeg"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => setLogoDataUrl(typeof reader.result === 'string' ? reader.result : null);
                                reader.readAsDataURL(file);
                              }}
                              style={{ fontSize: '12px' }}
                            />
                            {logoDataUrl && (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLogoDataUrl(null)}>Remove</button>
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Upload your outlet's own logo. Used on report letterheads.</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '10px' }}>
                        Report Sections
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-default)', marginBottom: '8px' }}>Shift Summary</div>
                          {DEFAULT_SHIFT_SUMMARY_CONFIG.sections.map((key) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '3px 0', color: 'var(--text-default)' }}>
                              <input
                                type="checkbox"
                                checked={ssEnabled.has(key)}
                                disabled={key === 'header'}
                                onChange={() => {
                                  if (key === 'header') return;
                                  setSsEnabled((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
                                }}
                              />
                              {SHIFT_SUMMARY_SECTION_LABELS[key]}
                            </label>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-default)', marginBottom: '8px' }}>Daily DSSR</div>
                          {DEFAULT_DSSR_CONFIG.sections.map((key) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '3px 0', color: 'var(--text-default)' }}>
                              <input
                                type="checkbox"
                                checked={dssrEnabled.has(key)}
                                disabled={key === 'header'}
                                onChange={() => {
                                  if (key === 'header') return;
                                  setDssrEnabled((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
                                }}
                              />
                              {DSSR_SECTION_LABELS[key]}
                            </label>
                          ))}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Toggle which sections appear in each report. Header is always included.</span>
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
            {activeTab === 'tanks' && <TanksGrid stationId={selectedStation.id} />}
            {activeTab === 'dispensers' && <DispensersList stationId={selectedStation.id} />}
            {activeTab === 'terminals' && <PaymentTerminalsPanel stationId={selectedStation.id} />}
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
