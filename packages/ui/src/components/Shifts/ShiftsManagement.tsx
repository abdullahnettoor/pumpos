import React, { useEffect, useState } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import { StatusBadge } from '../StatusBadge.js';
import { DssrView } from './DssrView.js';
import { Station } from '@pump/shared';

const shiftService = new CloudShiftService();

interface ShiftsManagementProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
}

export const ShiftsManagement: React.FC<ShiftsManagementProps> = ({
  selectedStation,
  userRole,
  userName,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [viewingDssr, setViewingDssr] = useState(false);

  // Open Shift Form States
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [openingCash, setOpeningCash] = useState(0);
  const [staffAssignments, setStaffAssignments] = useState<{ userId: string; duId: string }[]>([]);
  const [initialReadings, setInitialReadings] = useState<{ nozzleId: string; openingReading: number }[]>([]);
  const [isOpening, setIsOpening] = useState(false);

  // Active Shift Workspace States
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});
  const [savingProgress, setSavingProgress] = useState(false);

  // Close Flow Inline States
  const [isPreparingClose, setIsPreparingClose] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [confirmWarningsChecked, setConfirmWarningsChecked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Reactively compute close warnings when close flow is active
  const warnings: string[] = [];
  if (data?.activeShift && isPreparingClose) {
    let zeroVolumeCount = 0;
    for (const nr of data.activeShift.nozzleReadings) {
      const opening = Number(nr.openingReading);
      const closing = closingReadings[nr.nozzleId] ?? opening;
      const volume = closing - opening;

      if (volume === 0) {
        zeroVolumeCount++;
      }
      if (volume > 5000) {
        warnings.push(`High volume alert: Nozzle ${nr.nozzleName} sold ${volume.toFixed(2)} Liters.`);
      }
    }

    if (zeroVolumeCount === data.activeShift.nozzleReadings.length) {
      warnings.push('Zero fuel volume was sold across all nozzles during this shift.');
    }
    const openingCashNum = Number(data.activeShift.openingCash);
    if (closingCash === 0 && openingCashNum > 0) {
      warnings.push('Closing cash is ₹0, indicating no collections entered.');
    }
  }


  useEffect(() => {
    if (selectedStation) {
      loadShiftStatus();
    }
  }, [selectedStation]);

  const loadShiftStatus = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
      const statusData = await shiftService.getShiftStatus(selectedStation.id);
      setData(statusData);

      // Pre-select first template
      if (statusData.templates && statusData.templates.length > 0) {
        setSelectedTemplateId(statusData.templates[0].id);
      }

      // Initialize assignments list based on dispensers
      if (statusData.dispensers) {
        setStaffAssignments(
          statusData.dispensers.map((du: any) => ({
            duId: du.id,
            userId: statusData.staff[0]?.id ?? '',
          }))
        );
      }

      // Initialize manual readings fallbacks
      if (statusData.nozzles) {
        setInitialReadings(
          statusData.nozzles.map((nz: any) => ({
            nozzleId: nz.id,
            openingReading: Number(nz.currentReading),
          }))
        );

        // Populate active closing readings state if shift is open
        if (statusData.activeShift && statusData.activeShift.nozzleReadings) {
          const readingsMap: Record<string, number> = {};
          statusData.activeShift.nozzleReadings.forEach((nr: any) => {
            readingsMap[nr.nozzleId] = Number(nr.closingReading);
          });
          setClosingReadings(readingsMap);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load shifts configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      setIsOpening(true);
      const payload: any = {
        stationId: selectedStation.id,
        shiftTemplateId: selectedTemplateId,
        openingCash,
        staffAssignments: staffAssignments.filter((a) => a.userId !== ''),
      };

      // If no last shift exists, send the manual override initial readings
      if (!data.lastShift) {
        payload.initialReadings = initialReadings;
      }

      await shiftService.openShift(payload);
      await loadShiftStatus();
    } catch (err: any) {
      alert(err.message || 'Failed to open shift');
    } finally {
      setIsOpening(false);
    }
  };

  const handleStaffAssignmentChange = (duId: string, userId: string) => {
    setStaffAssignments((prev) =>
      prev.map((a) => (a.duId === duId ? { ...a, userId } : a))
    );
  };

  const handleInitialReadingChange = (nozzleId: string, openingReading: number) => {
    setInitialReadings((prev) =>
      prev.map((r) => (r.nozzleId === nozzleId ? { ...r, openingReading } : r))
    );
  };

  const handleClosingReadingChange = (nozzleId: string, val: number) => {
    setClosingReadings((prev) => ({
      ...prev,
      [nozzleId]: val,
    }));
  };

  const handleSaveProgress = async () => {
    if (!data.activeShift) return;
    try {
      setSavingProgress(true);
      const readingsArray = Object.entries(closingReadings).map(([nozzleId, closingReading]) => ({
        nozzleId,
        closingReading,
      }));
      await shiftService.updateNozzleReadings(data.activeShift.id, readingsArray);
      alert('Readings progress saved successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to save progress');
    } finally {
      setSavingProgress(false);
    }
  };

  const handlePrepareClose = () => {
    if (!data.activeShift) return;

    // Perform validation checks
    for (const nr of data.activeShift.nozzleReadings) {
      const opening = Number(nr.openingReading);
      const closing = closingReadings[nr.nozzleId] ?? opening;

      if (closing < opening) {
        alert(`Error: Closing reading for nozzle ${nr.nozzleName} (${closing}) cannot be less than opening reading (${opening})`);
        return;
      }
    }

    setConfirmWarningsChecked(false);
    setIsPreparingClose(true);
  };


  const handleCloseShift = async () => {
    if (!data.activeShift) return;
    try {
      setIsClosing(true);
      const readingsArray = Object.entries(closingReadings).map(([nozzleId, closingReading]) => ({
        nozzleId,
        closingReading,
      }));

      await shiftService.closeShift(data.activeShift.id, {
        closingCash,
        nozzleReadings: readingsArray,
      });

      setIsPreparingClose(false);
      await loadShiftStatus();
      setViewingDssr(true);
    } catch (err: any) {
      alert(err.message || 'Failed to close shift');
    } finally {
      setIsClosing(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to manage operational shifts.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        Resolving shift workspace states...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)' }}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  const { activeShift, lastShift, lastDssr, canReopenLastShift, gracePeriodExpiresAt, templates, nozzles, staff, dispensers } = data;

  // Render DSSR View if toggled
  if (viewingDssr && lastDssr) {
    return (
      <DssrView
        dssr={lastDssr}
        userRole={userRole}
        canReopen={canReopenLastShift}
        gracePeriodExpiresAt={gracePeriodExpiresAt}
        onReopenSuccess={() => {
          setViewingDssr(false);
          loadShiftStatus();
        }}
        onBack={() => setViewingDssr(false)}
      />
    );
  }

  // Render Active Shift Workspace
  if (activeShift) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
        {/* Workspace Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                Active Shift Workspace
              </h1>
              <StatusBadge status="OPEN" type="success" />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
              Template: <strong>{activeShift.templateName}</strong> • Opened by {activeShift.openedByName} at {new Date(activeShift.openedAt).toLocaleString()}
            </p>
          </div>
          {lastDssr && (
            <button
              onClick={() => setViewingDssr(true)}
              style={{
                height: '32px',
                padding: '0 12px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-surface-alt)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-button)',
                color: 'var(--text-strong)',
                cursor: 'pointer'
              }}
            >
              📄 View Last DSSR
            </button>
          )}
        </div>

        {/* Assigned Operators list */}
        {activeShift.staffAssignments && activeShift.staffAssignments.length > 0 && (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
            padding: '16px 20px',
          }}>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Shift Staff Assignments
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
              {activeShift.staffAssignments.map((sa: any, idx: number) => (
                <div key={idx} style={{ fontSize: '13px', color: 'var(--text-default)' }}>
                  🧑‍✈️ <strong>{sa.userName}</strong> assigned to dispenser <strong>{sa.duName}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Core nozzle grid */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Nozzle Readings Grid
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Record closing readings to compute operational volumes sold.
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Nozzle</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Product</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Tank</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Opening Rd</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Closing Rd</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Volume Sold</th>
              </tr>
            </thead>
            <tbody>
              {activeShift.nozzleReadings.map((nr: any, idx: number) => {
                const opening = Number(nr.openingReading);
                const closing = closingReadings[nr.nozzleId] ?? opening;
                const volume = closing - opening;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>{nr.nozzleName}</td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>{nr.productName} ({nr.productCode})</td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>{nr.tankName}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {opening.toFixed(3)}
                    </td>
                    <td style={{ padding: '8px 20px', textAlign: 'right' }}>
                      <input
                        type="number"
                        step="0.001"
                        value={closingReadings[nr.nozzleId] ?? ''}
                        onChange={(e) => handleClosingReadingChange(nr.nozzleId, Number(e.target.value))}
                        style={{
                          width: '110px',
                          height: '28px',
                          textAlign: 'right',
                          padding: '0 8px',
                          border: '1px solid var(--border-strong)',
                          borderRadius: 'var(--radius-input)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px'
                        }}
                      />
                    </td>
                    <td style={{
                      padding: '12px 20px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: volume < 0 ? 'var(--state-danger-fg)' : 'var(--text-strong)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {volume.toFixed(3)} L
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Save / Close Shift Inline Cards */}
        {!isPreparingClose ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={handleSaveProgress}
              disabled={savingProgress}
              style={{
                height: '38px',
                padding: '0 16px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-strong)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {savingProgress ? 'Saving...' : '💾 Save Readings Progress'}
            </button>

            <button
              onClick={handlePrepareClose}
              style={{
                height: '38px',
                padding: '0 18px',
                backgroundColor: 'var(--brand-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              🔒 Close Shift & Compile DSSR
            </button>
          </div>
        ) : (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            padding: '24px',
            borderRadius: 'var(--radius-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }} className="animate-fade-in">
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Reconciliation Review
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
                1. Enter Closing Cash Collected (Float + Sales Cash):
              </label>
              <input
                type="number"
                value={closingCash}
                onChange={(e) => setClosingCash(Number(e.target.value))}
                style={{
                  width: '200px',
                  height: '32px',
                  padding: '0 12px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px'
                }}
              />
            </div>

            {warnings.length > 0 && (
              <div style={{
                backgroundColor: 'var(--state-warning-bg)',
                color: 'var(--state-warning-fg)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                border: '1px solid var(--border-soft)'
              }}>
                <span style={{ fontWeight: 700 }}>⚠️ Shift Warning Indicators Raised:</span>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                  {warnings.map((w, idx) => (
                    <li key={idx} style={{ marginTop: '3px' }}>{w}</li>
                  ))}
                </ul>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="confirm_warn"
                    checked={confirmWarningsChecked}
                    onChange={(e) => setConfirmWarningsChecked(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="confirm_warn" style={{ fontWeight: 600, cursor: 'pointer' }}>
                    I explicitly confirm that these readings are correct and wish to proceed anyway.
                  </label>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={handleCloseShift}
                disabled={(warnings.length > 0 && !confirmWarningsChecked) || isClosing}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  backgroundColor: (warnings.length === 0 || confirmWarningsChecked) ? 'var(--brand-primary)' : 'var(--bg-surface-alt)',
                  color: (warnings.length === 0 || confirmWarningsChecked) ? 'white' : 'var(--text-muted)',
                  border: (warnings.length === 0 || confirmWarningsChecked) ? 'none' : '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: (warnings.length === 0 || confirmWarningsChecked) ? 'pointer' : 'not-allowed'
                }}
              >
                {isClosing ? 'Compiling DSSR...' : '✓ Confirm Close Shift'}
              </button>


              <button
                onClick={() => setIsPreparingClose(false)}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  backgroundColor: 'var(--bg-surface-alt)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-strong)',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render Open Shift Form
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      {/* Workspace Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            No Active Operational Shift
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Open a shift template to enable nozzle readings entry and daily cash reconciliation.
          </p>
        </div>
        {lastDssr && (
          <button
            onClick={() => setViewingDssr(true)}
            style={{
              height: '32px',
              padding: '0 12px',
              fontSize: '12px',
              backgroundColor: 'var(--bg-surface-alt)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-button)',
              color: 'var(--text-strong)',
              cursor: 'pointer'
            }}
          >
            📄 View Last DSSR
          </button>
        )}
      </div>

      {/* Main Open Shift Form */}
      <form onSubmit={handleOpenShift} style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        padding: '24px',
        borderRadius: 'var(--radius-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Shift details row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
              Select Shift Template:
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              required
              style={{
                height: '32px',
                padding: '0 10px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                fontSize: '13px',
                color: 'var(--text-strong)',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              {templates && templates.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.startTime} - {t.endTime})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
              Opening Cash Float Amount (₹):
            </label>
            <input
              type="number"
              value={openingCash}
              onChange={(e) => setOpeningCash(Number(e.target.value))}
              required
              style={{
                height: '30px',
                padding: '0 10px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px'
              }}
            />
          </div>
        </div>

        {/* Optional Staff Assignment sub-form */}
        {dispensers && dispensers.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Staff Assignment to Dispenser Units (Optional)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              {dispensers.map((du: any) => {
                const assigned = staffAssignments.find((a) => a.duId === du.id);
                return (
                  <div key={du.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-default)' }}>⛽ Dispenser <strong>{du.name}</strong></span>
                    <select
                      value={assigned?.userId ?? ''}
                      onChange={(e) => handleStaffAssignmentChange(du.id, e.target.value)}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-input)',
                        fontSize: '12px',
                        color: 'var(--text-strong)'
                      }}
                    >
                      <option value="">-- Unassigned --</option>
                      {staff && staff.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual Nozzle Readings override only for first-time / no-history runs */}
        {!lastShift && nozzles && nozzles.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{
              backgroundColor: 'var(--bg-surface-alt)',
              padding: '12px',
              borderRadius: 'var(--radius-input)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-soft)'
            }}>
              💡 <strong>First Operational Shift:</strong> Since there is no previous shift history for this station, please specify the initial opening readings for all nozzles.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {nozzles.map((nz: any) => {
                const initial = initialReadings.find((r) => r.nozzleId === nz.id);
                return (
                  <div key={nz.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-default)' }}>
                      Nozzle {nz.name} ({nz.productCode})
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={initial?.openingReading ?? 0}
                      onChange={(e) => handleInitialReadingChange(nz.id, Number(e.target.value))}
                      style={{
                        height: '26px',
                        padding: '0 8px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-input)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={isOpening}
            style={{
              height: '38px',
              padding: '0 24px',
              backgroundColor: 'var(--brand-primary)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {isOpening ? 'Opening Shift...' : '🚀 Start Shift Operations'}
          </button>
        </div>
      </form>
    </div>
  );
};
