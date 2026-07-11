import React from 'react';
import { FileText, Info, Play } from 'lucide-react';
import { Panel, Button, DateText } from '../../pump-ds/index.js';
import { Field, Select, NumberInput, DateField } from '../primitives/Field.js';

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

const sectionNote: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>No active shift</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Open a shift template to enable nozzle readings and daily cash reconciliation.
          </p>
        </div>
        {lastShiftSummary && (
          <Button variant="secondary" size="sm" leftIcon={<FileText />} onClick={onViewLastShiftSummary}>
            Last shift summary
          </Button>
        )}
      </div>

      {lastShiftSummary && (
        <Panel title="Most recent closed shift">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>Shift ID: <strong style={{ color: 'var(--text-default)', fontFamily: 'var(--font-mono)' }}>{lastShiftSummary.shiftId?.slice(0, 8) || lastShiftSummary.snapshotData?.shiftId?.slice(0, 8) || '—'}</strong></span>
            <span>Template: <strong style={{ color: 'var(--text-default)' }}>{lastShiftSummary.snapshotData?.templateName || lastShiftSummary.templateName || '—'}</strong></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Closed: <DateText value={lastShiftSummary.snapshotData?.closedAt || lastShiftSummary.closedAt} variant="datetime" tone="strong" /></span>
          </div>
        </Panel>
      )}

      {/* Main open-shift form */}
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Panel title="Shift details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <Field label="Shift template">
              <Select value={selectedTemplateId} onChange={(e) => onTemplateChange(e.target.value)} required>
                {templates && templates.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.startTime} - {t.endTime})</option>
                ))}
              </Select>
            </Field>
            <Field label="Business date" hint="defaults to today; back-date for an earlier day">
              <DateField value={businessDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => onBusinessDateChange(e.target.value)} required />
            </Field>
            <Field label="Opening cash float (₹)">
              <NumberInput min="0" value={openingCash} onChange={(e) => onOpeningCashChange(Number(e.target.value))} required />
            </Field>
          </div>
        </Panel>

        {dispensers && dispensers.length > 0 && (
          <Panel title="Staff assignment">
            <p style={sectionNote}>Assign attendants to dispenser units (optional).</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {dispensers.map((du: any) => {
                const assigned = staffAssignments.find((a) => a.duId === du.id);
                return (
                  <Field key={du.id} label={`Dispenser ${du.code || du.name}`}>
                    <Select value={assigned?.userId ?? ''} onChange={(e) => onStaffAssignmentChange(du.id, e.target.value)}>
                      <option value="">— Unassigned —</option>
                      {staff && staff.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.fullName}{!u.email ? ' (Attendant)' : ''}</option>
                      ))}
                    </Select>
                  </Field>
                );
              })}
            </div>
          </Panel>
        )}

        {terminals && terminals.length > 0 && (
          <Panel title="Payment terminals (POS)">
            <p style={sectionNote}>Assign each POS to a dispenser so attendants can declare its card/UPI batch at handover; leave shift-wide if shared across pumps.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {terminals.map((term: any) => {
                const assigned = terminalAssignments.find((t) => t.terminalId === term.id);
                const rails = [term.supportsCard ? 'Card' : null, term.supportsUpi ? 'UPI' : null].filter(Boolean).join(' + ');
                return (
                  <Field key={term.id} label={`${term.label}${rails ? ` (${rails})` : ''}`}>
                    <Select value={assigned?.duId ?? ''} onChange={(e) => onTerminalAssignmentChange(term.id, e.target.value)}>
                      <option value="">— Shift-wide (any pump) —</option>
                      {dispensers && dispensers.map((du: any) => (
                        <option key={du.id} value={du.id}>Dispenser {du.code || du.name}</option>
                      ))}
                    </Select>
                  </Field>
                );
              })}
            </div>
          </Panel>
        )}

        {!lastShift && nozzles && nozzles.length > 0 && (
          <Panel title="Opening nozzle readings">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', marginBottom: '12px' }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span><strong>First operational shift:</strong> no previous history for this station, so enter the initial opening readings for all nozzles.</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {nozzles.map((nz: any) => {
                const initial = initialReadings.find((r) => r.nozzleId === nz.id);
                return (
                  <Field key={nz.id} label={`Nozzle ${nz.name} (${nz.productCode})`}>
                    <NumberInput step="0.001" min="0" value={initial?.openingReading ?? 0} onChange={(e) => onInitialReadingChange(nz.id, Number(e.target.value))} />
                  </Field>
                );
              })}
            </div>
          </Panel>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" size="md" loading={isOpening} leftIcon={<Play style={{ fill: 'currentColor' }} />}>
            Start Shift Operations
          </Button>
        </div>
      </form>
    </div>
  );
};
