import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Info, Play } from 'lucide-react';
import { Panel, Button, Chip, Form } from '../../pump-ds/index.js';
import { Field, Select, NumberInput, DateField } from '../primitives/Field.js';
import type { BusinessDayStatusItem } from '../../services/cloud.js';
import {
  compareByDispenserThenNozzle,
  dispenserLabel,
  formatStationDateTime,
  shiftDisplayLabel,
} from '@pump/shared';
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

const sectionHeading: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  marginBottom: '6px',
};

const sectionNote: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  marginBottom: '12px',
};

/** The dispenser fields this form reads. Narrower than the API row on purpose. */
interface DispenserOption {
  id: string;
  code?: string | null;
  name?: string | null;
}

/** The terminal fields this form reads. */
interface TerminalOption {
  id: string;
  label: string;
  supportsCard?: boolean | null;
  supportsUpi?: boolean | null;
}

/** The staff fields this form reads. `email` distinguishes a back-office user. */
interface StaffOption {
  id: string;
  fullName: string;
  email?: string | null;
}

/** "POS A (Card + UPI)" — the rails matter when deciding which pump it belongs to. */
function terminalLabel(term: TerminalOption): string {
  const rails = [term.supportsCard ? 'Card' : null, term.supportsUpi ? 'UPI' : null]
    .filter(Boolean)
    .join(' + ');
  return `${term.label}${rails ? ` (${rails})` : ''}`;
}

/**
 * One dispenser unit's assignment: the attendant accountable for it this
 * shift, and the POS terminals that sit with them.
 *
 * Grouped per dispenser because that is the unit the operator actually thinks
 * in — "who is on pump 2 and which POS is with them". Two flat lists, one of
 * attendants and one of terminals, made that mapping something they had to
 * hold in their head while reading down both (#223).
 *
 * `role="group"` rather than a bare panel: these are related form controls,
 * and the dispenser's label is the only thing that tells two otherwise
 * identical "Attendant" selects apart — for a screen reader and for a test.
 */
const DispenserAssignmentCard: React.FC<{
  du: DispenserOption;
  dispensers: DispenserOption[];
  staff: StaffOption[];
  terminals: TerminalOption[];
  assignedUserId: string;
  terminalAssignments: { terminalId: string; duId: string }[];
  onStaffAssignmentChange: (duId: string, userId: string) => void;
  onTerminalAssignmentChange: (terminalId: string, duId: string) => void;
}> = ({
  du,
  dispensers,
  staff,
  terminals,
  assignedUserId,
  terminalAssignments,
  onStaffAssignmentChange,
  onTerminalAssignmentChange,
}) => {
  const label = `Dispenser ${dispenserLabel({ duCode: du.code, duName: du.name })}`;
  const duIdOf = (terminalId: string) =>
    terminalAssignments.find((t) => t.terminalId === terminalId)?.duId ?? '';
  const mine = terminals.filter((term) => duIdOf(term.id) === du.id);
  const attachable = terminals.filter((term) => duIdOf(term.id) !== du.id);
  const nameOfDu = (duId: string) => {
    const other = dispensers.find((d) => d.id === duId);
    return other ? dispenserLabel({ duCode: other.code, duName: other.name }) : null;
  };

  return (
    <Panel title={label} role="group" aria-label={label}>
      {/* `htmlFor` + `id` are not decoration here: every card renders an
          identically-labelled "Attendant" select, so without the association
          the dispenser's name is the only thing distinguishing them and
          nothing carries it to the control. */}
      <Field label="Attendant" htmlFor={`attendant-${du.id}`}>
        <Select
          id={`attendant-${du.id}`}
          value={assignedUserId}
          onChange={(e) => onStaffAssignmentChange(du.id, e.target.value)}
        >
          <option value="">— Unassigned —</option>
          {staff?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
              {!u.email ? ' (Attendant)' : ''}
            </option>
          ))}
        </Select>
      </Field>

      {terminals && terminals.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          {mine.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {mine.map((term) => (
                <Chip
                  key={term.id}
                  size="sm"
                  tone="info"
                  variant="soft"
                  // Detaching returns it to the shift-wide pool, which is where
                  // an unassigned POS lives — it is never removed from the shift.
                  onRemove={() => onTerminalAssignmentChange(term.id, '')}
                  removeLabel={`Detach ${term.label} from ${label}`}
                >
                  {terminalLabel(term)}
                </Chip>
              ))}
            </div>
          )}
          <Field label="Attach POS" htmlFor={`attach-pos-${du.id}`}>
            <Select
              id={`attach-pos-${du.id}`}
              value=""
              onChange={(e) => {
                if (e.target.value) onTerminalAssignmentChange(e.target.value, du.id);
              }}
            >
              <option value="">
                {mine.length > 0 ? '— Attach another POS —' : '— No POS attached —'}
              </option>
              {attachable.map((term) => {
                // A POS already on another pump is offered, but never silently:
                // moving it is one step, and the option says where it is now.
                const heldBy = nameOfDu(duIdOf(term.id));
                return (
                  <option key={term.id} value={term.id}>
                    {terminalLabel(term)}
                    {heldBy ? ` — on ${heldBy}` : ''}
                  </option>
                );
              })}
            </Select>
          </Field>
        </div>
      )}
    </Panel>
  );
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
  /**
   * Terminals on no dispenser. They keep their own panel rather than vanishing:
   * a POS shared across pumps is a real configuration, and a station with no
   * dispensers configured at all still has to see its terminals.
   */
  const sharedTerminals = useMemo(() => {
    // "Not on a dispenser that exists", not merely "has no duId". A stale
    // assignment naming a dispenser that is no longer configured matches
    // neither a card's list nor this one, so the terminal would render
    // nowhere at all while still being submitted with that stale link. The
    // old flat panel was immune by construction — it listed every terminal
    // unconditionally — so the invariant has to be stated here instead.
    const knownDuIds = new Set((dispensers ?? []).map((du: any) => du.id));
    return (terminals ?? []).filter((term: any) => {
      const duId = terminalAssignments.find((t) => t.terminalId === term.id)?.duId;
      return !duId || !knownDuIds.has(duId);
    });
  }, [dispensers, terminals, terminalAssignments]);
  const [customDateMode, setCustomDateMode] = useState(false);
  // The date the business-day query follows: whatever the operator picked, else
  // the prop. Derived rather than synced, so a new prop reaches the query
  // without an effect and a picked date is not overwritten by one.
  const [pickedBusinessDate, setPickedBusinessDate] = useState<string | null>(null);
  const queryBusinessDate = pickedBusinessDate ?? businessDate;

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
    // React Hook Form syncs these from props, replacing three hand-rolled
    // setValue effects. `keepDirtyValues` leaves a field the operator has
    // already edited alone — which those effects could not express, so an
    // unrelated parent re-render used to overwrite a half-filled form.
    values: { shiftTemplateId: selectedTemplateId, businessDate, openingCash },
    resetOptions: { keepDirtyValues: true },
  });
  const formTemplateId = watch('shiftTemplateId');
  const formBusinessDate = watch('businessDate');
  const selectedTemplate = templates.find((template: any) => template.id === formTemplateId);
  const knownOpenDate = openBusinessDays.some((day) => day.businessDate === formBusinessDate);
  const dateChoice = !customDateMode && knownOpenDate ? formBusinessDate : 'custom';
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
              Shift:{' '}
              <strong style={{ color: 'var(--text-default)', fontFamily: 'var(--font-mono)' }}>
                {shiftDisplayLabel({
                  businessDate: lastShift?.businessDate ?? lastShiftSummary.businessDate,
                  shiftSequence: lastShift?.shiftSequence ?? lastShiftSummary.shiftSequence,
                  shiftId: lastShiftSummary.shiftId ?? lastShiftSummary.snapshotData?.shiftId,
                })}
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
                    setPickedBusinessDate(e.target.value);
                    setValue('businessDate', e.target.value, { shouldValidate: true });
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
                    onChange: (e) => setPickedBusinessDate(e.target.value),
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
                .sort(compareByDispenserThenNozzle(dispenserLabel, (n: any) => n.name))
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
          // A plain section, not a Panel: each card below is already one, and
          // nesting draws a second bordered box inside the first.
          <section>
            <h3 style={sectionHeading}>Dispenser assignment</h3>
            <p style={sectionNote}>
              Who is on each pump, and which POS is with them. Both are optional; a POS left
              shift-wide is shared across pumps.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '12px',
              }}
            >
              {dispensers.map((du: any) => (
                <DispenserAssignmentCard
                  key={du.id}
                  du={du}
                  dispensers={dispensers}
                  staff={staff}
                  terminals={terminals}
                  assignedUserId={staffAssignments.find((a) => a.duId === du.id)?.userId ?? ''}
                  terminalAssignments={terminalAssignments}
                  onStaffAssignmentChange={onStaffAssignmentChange}
                  onTerminalAssignmentChange={onTerminalAssignmentChange}
                />
              ))}
            </div>
          </section>
        )}

        {sharedTerminals.length > 0 && (
          <Panel title="Shift-wide POS" role="group" aria-label="Shift-wide POS">
            <p style={sectionNote}>
              Not tied to a pump. Any attendant can declare these at handover — attach one to a
              dispenser above if only that pump uses it.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {sharedTerminals.map((term: any) => (
                <Chip key={term.id} size="sm" tone="neutral" variant="soft">
                  {terminalLabel(term)}
                </Chip>
              ))}
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
