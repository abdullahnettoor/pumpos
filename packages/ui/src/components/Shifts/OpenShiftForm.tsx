import React from 'react';
import { FileText, Fuel, Info, Play, CreditCard } from 'lucide-react';

interface OpenShiftFormProps {
  lastShiftSummary: any;
  lastShift: any;
  templates: any[];
  dispensers: any[];
  staff: any[];
  nozzles: any[];
  terminals: any[];
  terminalAssignments: { terminalId: string; duId: string }[];
  onTerminalAssignmentChange: (terminalId: string, duId: string) => void;
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
  businessDate: string;
  onBusinessDateChange: (value: string) => void;
  openingCash: number;
  onOpeningCashChange: (value: number) => void;
  staffAssignments: { userId: string; duId: string }[];
  onStaffAssignmentChange: (duId: string, userId: string) => void;
  initialReadings: { nozzleId: string; openingReading: number }[];
  onInitialReadingChange: (nozzleId: string, value: number) => void;
  isOpening: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onViewLastShiftSummary: () => void;
}

/**
 * Idle-state form for opening a new operational shift: template + opening cash float,
 * optional staff→dispenser assignment, and first-run nozzle opening readings.
 * Extracted from ShiftsManagement (presentational; state lives in the parent).
 */
export const OpenShiftForm: React.FC<OpenShiftFormProps> = ({
  lastShiftSummary,
  lastShift,
  templates,
  dispensers,
  staff,
  nozzles,
  terminals,
  terminalAssignments,
  onTerminalAssignmentChange,
  selectedTemplateId,
  onTemplateChange,
  businessDate,
  onBusinessDateChange,
  openingCash,
  onOpeningCashChange,
  staffAssignments,
  onStaffAssignmentChange,
  initialReadings,
  onInitialReadingChange,
  isOpening,
  onSubmit,
  onViewLastShiftSummary,
}) => {
  return (
    <>
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
        {lastShiftSummary && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onViewLastShiftSummary}
          >
            <FileText size={13} /> View Last Shift Summary
          </button>
        )}
      </div>

      {lastShiftSummary && (
        <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-strong)' }}>
            Most Recent Closed Shift Snapshot
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>Shift ID: <strong style={{ color: 'var(--text-default)', fontFamily: 'var(--font-mono)' }}>{lastShiftSummary.shiftId?.slice(0, 8) || lastShiftSummary.snapshotData?.shiftId?.slice(0, 8) || '—'}</strong></span>
            <span>Template: <strong style={{ color: 'var(--text-default)' }}>{lastShiftSummary.snapshotData?.templateName || lastShiftSummary.templateName || '—'}</strong></span>
            <span>Closed At: <strong style={{ color: 'var(--text-default)' }}>{(lastShiftSummary.snapshotData?.closedAt || lastShiftSummary.closedAt) ? new Date(lastShiftSummary.snapshotData?.closedAt || lastShiftSummary.closedAt).toLocaleString('en-IN') : '—'}</strong></span>
          </div>
        </div>
      )}

      {/* Main Open Shift Form */}
      <form onSubmit={onSubmit} className="card card-default" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Shift details row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
              Select Shift Template:
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => onTemplateChange(e.target.value)}
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
              Business Date:
            </label>
            <input
              type="date"
              value={businessDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => onBusinessDateChange(e.target.value)}
              required
              style={{
                height: '30px',
                padding: '0 10px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: 'var(--text-strong)',
                backgroundColor: 'var(--bg-surface)'
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Defaults to today. Back-date if opening for an earlier day.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
              Opening Cash Float Amount (₹):
            </label>
            <input
              type="number"
              min="0"
              value={openingCash}
              onChange={(e) => onOpeningCashChange(Number(e.target.value))}
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
                    <span style={{ fontSize: '13px', color: 'var(--text-default)' }}>
                      <Fuel size={13} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> Dispenser <strong>{du.code || du.name}</strong>
                    </span>
                    <select
                      value={assigned?.userId ?? ''}
                      onChange={(e) => onStaffAssignmentChange(du.id, e.target.value)}
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
                          {u.fullName} {!u.email ? ' (Attendant)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional Payment Terminal (POS) assignment to dispenser units */}
        {terminals && terminals.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Payment Terminal (POS) Assignment (Optional)
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-6px' }}>
              Assign each POS machine to a dispenser so attendants can declare its card/UPI batch at handover. Leave as shift-wide if a terminal is shared across pumps.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              {terminals.map((term: any) => {
                const assigned = terminalAssignments.find((t) => t.terminalId === term.id);
                const rails = [term.supportsCard ? 'Card' : null, term.supportsUpi ? 'UPI' : null].filter(Boolean).join(' + ');
                return (
                  <div key={term.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-default)' }}>
                      <CreditCard size={13} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> <strong>{term.label}</strong>
                      {rails && <span style={{ color: 'var(--text-faint)', fontSize: '11px', marginLeft: '4px' }}>({rails})</span>}
                    </span>
                    <select
                      value={assigned?.duId ?? ''}
                      onChange={(e) => onTerminalAssignmentChange(term.id, e.target.value)}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-input)',
                        fontSize: '12px',
                        color: 'var(--text-strong)'
                      }}
                    >
                      <option value="">-- Shift-wide (any pump) --</option>
                      {dispensers && dispensers.map((du: any) => (
                        <option key={du.id} value={du.id}>
                          Dispenser {du.code || du.name}
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
              <Info size={14} style={{ color: 'var(--brand-primary)', marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> <strong>First Operational Shift:</strong> Since there is no previous shift history for this station, please specify the initial opening readings for all nozzles.
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
                      min="0"
                      value={initial?.openingReading ?? 0}
                      onChange={(e) => onInitialReadingChange(nz.id, Number(e.target.value))}
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
            className="btn btn-primary btn-md"
            disabled={isOpening}
          >
            {isOpening ? 'Opening Shift...' : (
              <>
                <Play size={13} style={{ fill: 'currentColor', marginRight: '6px' }} /> Start Shift Operations
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
};
