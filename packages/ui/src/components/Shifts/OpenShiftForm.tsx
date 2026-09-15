import React, { useEffect, useState } from 'react';
import { FileText, Info, Play } from 'lucide-react';
import { Panel, Button, Form } from '../../pump-ds/index.js';
import { Field, Select, NumberInput, DateField } from '../primitives/Field.js';
import type { BusinessDayStatusItem } from '../../services/cloud.js';
import { formatStationDateTime } from '@pump/shared';
import { createOpenShiftFormSchema, type OpenShiftFormValues } from '@pump/shared';
import { ShiftBusinessDateContext } from './ShiftBusinessDateContext.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { useBusinessDayStatus } from '../../query/hooks.js';

interface OpenShiftFormProps {
  lastShiftSummary: any;
  lastShift: any;
  stationId: string;
  templates: any[];
  dispensers: any[];
  staff: any[];
  nozzles: any[];
  terminals: any[];
  terminalAssignments: { terminalId: string; duId: string }[];
  onTerminalAssignmentChange: (terminalId: string, duId: string) => void;
  selectedTemplateId: string;
  businessDate: string;
  currentBusinessDate: string;
  timeZone?: string;
  openingCash: number;
  staffAssignments: { userId: string; duId: string }[];
  onStaffAssignmentChange: (duId: string, userId: string) => void;
  initialReadings: { nozzleId: string; openingReading: number }[];
  onInitialReadingChange: (nozzleId: string, value: number) => void;
  isOpening: boolean;
  onSubmit: (values: OpenShiftFormValues) => void | Promise<unknown>;
  onViewLastShiftSummary: () => void;
}

const sectionNote: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  marginBottom: '12px',
};

/**
 * Idle-state form for opening a new operational shift: template + opening cash float,
 * optional staff→dispenser assignment, and first-run nozzle opening readings.
 * Extracted from ShiftsManagement (presentational; state lives in the parent).
 */
export const OpenShiftForm: React.FC<OpenShiftFormProps> = ({
  lastShiftSummary,
  lastShift,
  stationId,
  templates,
  dispensers,
  staff,
  nozzles,
  terminals,
  terminalAssignments,
  onTerminalAssignmentChange,
  selectedTemplateId,
  businessDate,
  currentBusinessDate,
  timeZone,
  openingCash,
  staffAssignments,
  onStaffAssignmentChange,
  initialReadings,
  onInitialReadingChange,
  isOpening,
  onSubmit,
  onViewLastShiftSummary,
}) => {
  const [customDateMode, setCustomDateMode] = useState(false);
  const [queryBusinessDate, setQueryBusinessDate] = useState(businessDate);
  const businessDayStatusQ = useBusinessDayStatus(stationId, queryBusinessDate);
  const businessDayState = businessDayStatusQ.isError
    ? 'UNAVAILABLE'
    : (businessDayStatusQ.data?.requestedState ?? 'UNKNOWN');
  const openBusinessDays: BusinessDayStatusItem[] = businessDayStatusQ.data?.openBusinessDays ?? [];
  const schema = createOpenShiftFormSchema(currentBusinessDate, businessDayState);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useZodForm<OpenShiftFormValues>(schema, {
    defaultValues: { shiftTemplateId: selectedTemplateId, businessDate, openingCash },
  });
  const formTemplateId = watch('shiftTemplateId');
  const formBusinessDate = watch('businessDate');
  const selectedTemplate = templates.find((template: any) => template.id === formTemplateId);
  const knownOpenDate = openBusinessDays.some((day) => day.businessDate === formBusinessDate);
  const dateChoice = !customDateMode && knownOpenDate ? formBusinessDate : 'custom';

  useEffect(() => {
    if (selectedTemplateId)
      setValue('shiftTemplateId', selectedTemplateId, { shouldValidate: true });
  }, [selectedTemplateId, setValue]);
  useEffect(() => {
    setValue('businessDate', businessDate, { shouldValidate: true });
    setQueryBusinessDate(businessDate);
  }, [businessDate, setValue]);
  useEffect(
    () => setValue('openingCash', openingCash, { shouldValidate: true }),
    [openingCash, setValue],
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            No active shift
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Open a shift template to enable nozzle readings and daily cash reconciliation.
          </p>
        </div>
        {lastShiftSummary && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<FileText />}
            onClick={onViewLastShiftSummary}
          >
            Last shift summary
          </Button>
        )}
      </div>

      {lastShiftSummary && (
        <Panel title="Most recent closed shift">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              Shift ID:{' '}
              <strong style={{ color: 'var(--text-default)', fontFamily: 'var(--font-mono)' }}>
                {lastShiftSummary.shiftId?.slice(0, 8) ||
                  lastShiftSummary.snapshotData?.shiftId?.slice(0, 8) ||
                  '—'}
              </strong>
            </span>
            <span>
              Template:{' '}
              <strong style={{ color: 'var(--text-default)' }}>
                {lastShiftSummary.snapshotData?.templateName ||
                  lastShiftSummary.templateName ||
                  '—'}
              </strong>
            </span>
            <span>
              Shift Closed At:{' '}
              <strong style={{ color: 'var(--text-default)' }}>
                {formatStationDateTime(
                  lastShiftSummary.snapshotData?.closedAt || lastShiftSummary.closedAt,
                  timeZone,
                )}
              </strong>
            </span>
          </div>
        </Panel>
      )}

      {/* Main open-shift form */}
      <Form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <ShiftBusinessDateContext
          businessDate={formBusinessDate}
          currentBusinessDate={currentBusinessDate}
          scheduledStartTime={selectedTemplate?.startTime}
          scheduledEndTime={selectedTemplate?.endTime}
        />
        <Panel title="Shift details">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            <Field label="Shift template" error={errors.shiftTemplateId?.message} required>
              <Select {...register('shiftTemplateId')} invalid={!!errors.shiftTemplateId}>
                {templates &&
                  templates.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · Scheduled {t.startTime}–{t.endTime}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              label="Shift Business Date"
              hint="Known open Business Days are listed first. Choose Custom Business Date for another eligible date."
            >
              <Select
                value={dateChoice}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setCustomDateMode(true);
                  } else {
                    setCustomDateMode(false);
                    setValue('businessDate', e.target.value, { shouldValidate: true });
                    setQueryBusinessDate(e.target.value);
                  }
                }}
              >
                {openBusinessDays.map((day) => (
                  <option
                    key={day.id}
                    value={day.businessDate}
                    disabled={day.businessDate > currentBusinessDate}
                  >
                    {day.businessDate} · Open
                    {day.businessDate > currentBusinessDate ? ' · Unavailable (future)' : ''}
                  </option>
                ))}
                <option value="custom">Custom Business Date</option>
              </Select>
            </Field>
            {dateChoice === 'custom' && (
              <Field
                label="Custom Business Date"
                error={errors.businessDate?.message}
                hint={
                  businessDayState === 'CLOSED'
                    ? 'Unavailable: this Business Day is closed. Choose an open or not-yet-created Business Date.'
                    : businessDayState === 'OPEN'
                      ? 'This Shift will attach to the existing open Business Day.'
                      : businessDayState === 'NOT_CREATED'
                        ? 'The Business Day will be created when this Shift opens.'
                        : businessDayState === 'UNAVAILABLE'
                          ? 'Business Day status is unavailable. Check the connection and retry.'
                          : 'Checking the Business Day lifecycle state.'
                }
              >
                <DateField
                  {...register('businessDate', {
                    onChange: (e) => setQueryBusinessDate(e.target.value),
                  })}
                  invalid={!!errors.businessDate}
                  required
                />
                {formBusinessDate > currentBusinessDate && (
                  <div
                    style={{ marginTop: '5px', color: 'var(--state-danger-fg)', fontSize: '11px' }}
                  >
                    Unavailable: future Business Dates cannot be used to open a Shift.
                  </div>
                )}
              </Field>
            )}
            <Field label="Opening cash float (₹)" error={errors.openingCash?.message} required>
              <NumberInput
                {...register('openingCash', { valueAsNumber: true })}
                min="0"
                invalid={!!errors.openingCash}
              />
            </Field>
          </div>
        </Panel>

        {!lastShift && nozzles && nozzles.length > 0 && (
          <Panel title="Opening nozzle readings">
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                backgroundColor: 'var(--state-info-bg)',
                color: 'var(--state-info-fg)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                marginBottom: '12px',
              }}
            >
              <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                <strong>First operational shift:</strong> no previous history for this station, so
                enter the initial opening readings for all nozzles.
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
              }}
            >
              {[...nozzles]
                .sort((a: any, b: any) => {
                  const du = String(a.duCode || a.duName || '').localeCompare(
                    String(b.duCode || b.duName || ''),
                    undefined,
                    { numeric: true },
                  );
                  if (du !== 0) return du;
                  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
                    numeric: true,
                  });
                })
                .map((nz: any) => {
                  const initial = initialReadings.find((r) => r.nozzleId === nz.id);
                  return (
                    <Field
                      key={nz.id}
                      label={`Nozzle ${nz.name} — ${nz.productCode} (${nz.unit || 'L'})`}
                    >
                      <NumberInput
                        step="0.001"
                        min="0"
                        placeholder="0"
                        value={initial?.openingReading || ''}
                        onChange={(e) => onInitialReadingChange(nz.id, Number(e.target.value))}
                      />
                    </Field>
                  );
                })}
            </div>
          </Panel>
        )}

        {dispensers && dispensers.length > 0 && (
          <Panel title="Staff assignment">
            <p style={sectionNote}>Assign attendants to dispenser units (optional).</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
              }}
            >
              {dispensers.map((du: any) => {
                const assigned = staffAssignments.find((a) => a.duId === du.id);
                return (
                  <Field key={du.id} label={`Dispenser ${du.code || du.name}`}>
                    <Select
                      value={assigned?.userId ?? ''}
                      onChange={(e) => onStaffAssignmentChange(du.id, e.target.value)}
                    >
                      <option value="">— Unassigned —</option>
                      {staff &&
                        staff.map((u: any) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName}
                            {!u.email ? ' (Attendant)' : ''}
                          </option>
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
            <p style={sectionNote}>
              Assign each POS to a dispenser so attendants can declare its card/UPI batch at
              handover; leave shift-wide if shared across pumps.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
              }}
            >
              {terminals.map((term: any) => {
                const assigned = terminalAssignments.find((t) => t.terminalId === term.id);
                const rails = [term.supportsCard ? 'Card' : null, term.supportsUpi ? 'UPI' : null]
                  .filter(Boolean)
                  .join(' + ');
                return (
                  <Field key={term.id} label={`${term.label}${rails ? ` (${rails})` : ''}`}>
                    <Select
                      value={assigned?.duId ?? ''}
                      onChange={(e) => onTerminalAssignmentChange(term.id, e.target.value)}
                    >
                      <option value="">— Shift-wide (any pump) —</option>
                      {dispensers &&
                        dispensers.map((du: any) => (
                          <option key={du.id} value={du.id}>
                            Dispenser {du.code || du.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                );
              })}
            </div>
          </Panel>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isOpening}
            disabled={
              formBusinessDate > currentBusinessDate ||
              businessDayState === 'CLOSED' ||
              businessDayState === 'UNKNOWN' ||
              businessDayState === 'UNAVAILABLE'
            }
            leftIcon={<Play style={{ fill: 'currentColor' }} />}
          >
            Start Shift Operations
          </Button>
        </div>
      </Form>
    </div>
  );
};
