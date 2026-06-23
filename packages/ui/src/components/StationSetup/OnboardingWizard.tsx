import React, { useState, useEffect } from 'react';
import { Station } from '@pump/shared';
import { CloudStationService } from '../../services/cloud.js';
import { ProductsCatalog } from './ProductsCatalog.js';
import { TanksGrid } from './TanksGrid.js';
import { DispensersList } from './DispensersList.js';
import { ShiftTemplates } from './ShiftTemplates.js';

const stationService = new CloudStationService();

interface OnboardingWizardProps {
  onOnboardingComplete: (station: Station) => void;
  userName: string;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onOnboardingComplete,
  userName,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [stationId, setStationId] = useState<string | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1 Form States
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [graceMinutes, setGraceMinutes] = useState(15);

  // Load existing stations on mount to check if we have one in progress
  useEffect(() => {
    const fetchInProgressStation = async () => {
      try {
        setLoading(true);
        const list = await stationService.getStations();
        // If there's an in-progress station, load it
        const inProgress = list.find(s => s.onboardingStatus !== 'READY_FOR_OPERATIONS');
        if (inProgress) {
          setStation(inProgress);
          setStationId(inProgress.id);
          setName(inProgress.name);
          setCode(inProgress.code);
          setAddress(inProgress.address || '');
          setPhone(inProgress.phone || '');
          setGraceMinutes(inProgress.settings?.shift_grace_minutes || 15);

          // Determine the furthest step completed
          const status = await stationService.getOnboardingStatus(inProgress.id);
          setChecklist(status.checklist);

          if (status.checklist.hasNozzles && status.checklist.hasDispensers) {
            setCurrentStep(5);
          } else if (status.checklist.hasTanks) {
            setCurrentStep(4);
          } else if (status.checklist.hasFuel) {
            setCurrentStep(3);
          } else {
            setCurrentStep(2);
          }
        }
      } catch (err) {
        console.error('Failed to load initial station setup state:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInProgressStation();
  }, []);

  const refreshChecklist = async (id: string) => {
    try {
      const status = await stationService.getOnboardingStatus(id);
      setChecklist(status.checklist);
      return status.checklist;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      let savedStation: Station;

      if (stationId) {
        // Update
        savedStation = await stationService.updateStation(stationId, {
          name,
          code: code.toUpperCase(),
          address,
          phone,
          settings: {
            shift_grace_minutes: graceMinutes,
            offline_warning_days: 3,
            offline_critical_days: 7,
          },
          onboardingStatus: 'IN_PROGRESS'
        });
      } else {
        // Create
        savedStation = await stationService.createStation({
          name,
          code: code.toUpperCase(),
          address,
          phone,
          settings: {
            shift_grace_minutes: graceMinutes,
            offline_warning_days: 3,
            offline_critical_days: 7,
          },
          isActive: true,
        });
        // Transition newly created station to IN_PROGRESS
        savedStation = await stationService.updateStation(savedStation.id, {
          ...savedStation,
          onboardingStatus: 'IN_PROGRESS'
        });
      }

      setStation(savedStation);
      setStationId(savedStation.id);
      await refreshChecklist(savedStation.id);
      setCurrentStep(2);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save station details');
    } finally {
      setLoading(false);
    }
  };



  const handleNextStep = async () => {
    if (!stationId) return;

    setValidating(true);
    setErrorMsg(null);
    try {
      const list = await refreshChecklist(stationId);
      if (!list) throw new Error('Could not verify step completion');

      if (currentStep === 2 && !list.hasFuel) {
        throw new Error('Please configure at least one active Fuel product before proceeding.');
      }
      if (currentStep === 3 && !list.hasTanks) {
        throw new Error('Please add at least one storage tank before proceeding.');
      }
      if (currentStep === 4 && (!list.hasDispensers || !list.hasNozzles)) {
        throw new Error('Please configure at least one dispenser unit and map at least one nozzle before proceeding.');
      }

      setCurrentStep(prev => prev + 1);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleCompleteSetup = async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const finalCheck = await refreshChecklist(stationId);
      if (!finalCheck || !finalCheck.hasFuel || !finalCheck.hasTanks || !finalCheck.hasDispensers || !finalCheck.hasNozzles) {
        throw new Error('Onboarding requirements not met. Please complete products, tanks, dispensers, and nozzles.');
      }

      const completed = await stationService.completeOnboarding(stationId);
      onOnboardingComplete(completed);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, title: 'Station Basics' },
    { num: 2, title: 'Products Catalog' },
    { num: 3, title: 'Storage Tanks' },
    { num: 4, title: 'Dispenser Units & Nozzles' },
    { num: 5, title: 'Shift Setup (Optional)' }
  ];

  if (loading && currentStep === 1) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', backgroundColor: 'var(--bg-canvas)' }}>
        Loading station onboarding wizard...
      </div>
    );
  }



  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--bg-canvas)',
      overflow: 'hidden'
    }}>

      {/* Top Header & Progress Stepper */}
      <header style={{
        height: '64px',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-8)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)' }}>
            PumpOS Setup
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {station ? `${station.name} (${station.code})` : 'New Station Onboarding'}
          </span>
        </div>

        {/* Modern Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {steps.map((s, idx) => {
            const isCompleted = currentStep > s.num;
            const isActive = currentStep === s.num;
            return (
              <React.Fragment key={s.num}>
                <div
                  onClick={() => {
                    if (stationId && s.num < currentStep) {
                      setCurrentStep(s.num);
                      setErrorMsg(null);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: (stationId && s.num < currentStep) ? 'pointer' : 'default',
                    opacity: (s.num <= currentStep || stationId) ? 1 : 0.4
                  }}
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? 'var(--brand-primary)' : (isCompleted ? 'var(--state-success-bg)' : 'var(--bg-surface-alt)'),
                    border: `1px solid ${isActive ? 'var(--brand-primary)' : 'var(--border-strong)'}`,
                    color: isActive ? '#ffffff' : (isCompleted ? 'var(--state-success-fg)' : 'var(--text-muted)'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {isCompleted ? '✓' : s.num}
                  </div>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--text-strong)' : 'var(--text-muted)',
                    whiteSpace: 'nowrap'
                  }}>
                    {s.title}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--border-strong)' }}>
                    <path d="M2 2l4 4-4 4" />
                  </svg>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </header>

      {/* Main Form Center Area */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '840px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>

          {errorMsg && (
            <div style={{
              backgroundColor: 'var(--state-danger-bg)',
              border: '1px solid rgba(159, 63, 54, 0.2)',
              color: 'var(--state-danger-fg)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-card)',
              fontSize: '13px',
              fontWeight: 500
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            padding: '32px',
            borderRadius: 'var(--radius-card)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)',
            minHeight: '400px'
          }}>
            {currentStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ borderBottom: '1px solid var(--border-soft)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Setup Your Station Basics</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                    Welcome to PumpOS. The operating system for fuel retail.
                  </p>
                </div>

                <form onSubmit={handleCreateStation} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Station Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Shell Gachibowli"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Station Code * (Unique Identifier)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. SH-HYD-01"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Station Address</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Outer Ring Road, Gachibowli, Hyderabad"
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
                        placeholder="e.g. +91 9876543210"
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

                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--border-soft)', paddingTop: '20px' }}>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        height: '38px',
                        padding: '0 20px',
                        backgroundColor: 'var(--brand-primary)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-button)',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {loading ? 'Saving...' : (stationId ? 'Save & Continue' : 'Initialize Station')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {currentStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 2: Configure Products Catalog</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>Define the fuels and lubricants sold at your outlet.</p>
                  </div>
                </div>
                <ProductsCatalog />
              </div>
            )}

            {currentStep === 3 && stationId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 3: Define Storage Tanks</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>Configure underground tanks linked to fuel products.</p>
                  </div>
                </div>
                <TanksGrid stationId={stationId} />
              </div>
            )}

            {currentStep === 4 && stationId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 4: Dispenser Units & Nozzles Mapping</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>Add fuel pump islands and map nozzles directly inside each unit form.</p>
                  </div>
                </div>
                <DispensersList stationId={stationId} />
              </div>
            )}

            {currentStep === 5 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 5: Shift Templates Setup (Optional)</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>Define regular operational shifts for operator allocation.</p>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {checklist ? `Configured: ${checklist.fuelCount} fuels, ${checklist.tankCount} tanks, ${checklist.duCount} DUs, ${checklist.nozzleCount} nozzles` : ''}
                  </span>
                </div>
                <ShiftTemplates />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Sticky Bottom Footer */}
      {currentStep > 1 && (
        <footer style={{
          height: '72px',
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-10)',
          flexShrink: 0
        }}>
          <button
            onClick={() => setCurrentStep(prev => prev - 1)}
            style={{
              height: '36px',
              padding: '0 16px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-default)',
              borderRadius: 'var(--radius-button)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px'
            }}
          >
            ← Previous Step
          </button>

          {currentStep === 5 ? (
            <button
              onClick={handleCompleteSetup}
              disabled={loading}
              style={{
                height: '38px',
                padding: '0 20px',
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              {loading ? 'Completing Setup...' : 'Complete Onboarding & Start Operations ✓'}
            </button>
          ) : (
            <button
              onClick={handleNextStep}
              disabled={validating}
              style={{
                height: '38px',
                padding: '0 20px',
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              {validating ? 'Validating...' : 'Next Step ➜'}
            </button>
          )}
        </footer>
      )}
    </div>
  );
};
