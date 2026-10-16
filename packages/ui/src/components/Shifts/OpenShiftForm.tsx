import React, { useId, useMemo, useState } from 'react';
import { Controller } from 'react-hook-form';
import { Info, Play } from 'lucide-react';
import { Panel, Button, Chip, DatePickerButton, Form } from '../../pump-ds/index.js';
import { Field, Select, NumberInput } from '../primitives/Field.js';
import { formatBusinessDate, inr } from '../../utils/format.js';
import type { BusinessDayStatusItem } from '../../services/cloud.js';
import { businessDateSettings, compareByDispenserThenNozzle, dispenserLabel } from '@pump/shared';
import { createOpenShiftFormSchema, type OpenShiftFormValues } from '@pump/shared';
import { ShiftBusinessDateContext } from './ShiftBusinessDateContext.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { mutationKeys, useBusinessDayStatus } from '../../query/hooks.js';
import { useWriteStates } from '../../query/pendingWrites.js';
import { Banner } from '../primitives/Banner.js';
import { ChangePriceDrawer } from '../StationSetup/PricingDrawers.js';
import { useFuelPriceRows } from '../StationSetup/useFuelPriceRows.js';
import {
  fuelPriceWriteKey,
  unconfirmedAttempt,
  type FuelPriceAttempt,
  type FuelPriceRow,
} from '../StationSetup/fuelPriceRows.js';
import { ShiftRatesPanel } from './ShiftRatesPanel.js';
import {
  fuelsBlockingOpen,
  plannedShiftWindow,
  rateChangeWarning,
  scheduledChangesDuringShift,
  type ShiftTemplateTimes,
} from './shiftRates.js';

interface OpenShiftFormProps {
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
  staffAssignments: { userId: string; duId: string; openingFloat: number }[];
  onStaffAssignmentChange: (duId: string, userId: string) => void;
  /** Opening Float per dispenser Drawer (ADR 0005). */
  onOpeningFloatChange: (duId: string, openingFloat: number) => void;
  initialReadings: { nozzleId: string; openingReading: number }[];
  onInitialReadingChange: (nozzleId: string, value: number) => void;
  isOpening: boolean;
  onSubmit: (values: OpenShiftFormValues) => void | Promise<unknown>;
  /** The station clock: the shift's planned window and its rates' times (#619). */
  clock?: { timeZone: string; dayStartsAt: string };
  /** Whether "Change price" is offered beside each rate (Owner, Manager). */
  canChangePrice?: boolean;
  /**
   * The server's refusal of the last open for a fuel without a rate (#630),
   * and when it came. Shown until the rates are read again: from then on the
   * form's own check says the same, from fresher rates.
   */
  openRefusal?: { message: string; at: number } | null;
}

/** Without a station clock: the default zone and Day Start. */
const DEFAULT_CLOCK = businessDateSettings(undefined);

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
  role?: string | null;
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
  openingFloat: number;
  terminalAssignments: { terminalId: string; duId: string }[];
  onStaffAssignmentChange: (duId: string, userId: string) => void;
  onOpeningFloatChange: (duId: string, openingFloat: number) => void;
  onTerminalAssignmentChange: (terminalId: string, duId: string) => void;
}> = ({
  du,
  dispensers,
  staff,
  terminals,
  assignedUserId,
  openingFloat,
  terminalAssignments,
  onStaffAssignmentChange,
  onOpeningFloatChange,
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
              {u.role ? ` (${u.role})` : ''}
            </option>
          ))}
        </Select>
      </Field>
      {assignedUserId && (
        <Field label="Opening float (₹)" htmlFor={`float-${du.id}`}>
          <NumberInput
            id={`float-${du.id}`}
            min="0"
            // Blank for 0/unset so the operator types into an empty box; submit
            // still sends 0 (#302).
            value={Number.isFinite(openingFloat) && openingFloat !== 0 ? openingFloat : ''}
            placeholder="0"
            invalid={openingFloat < 0}
            onChange={(e) => {
              const v = e.target.value === '' ? 0 : Number(e.target.value);
              onOpeningFloatChange(du.id, Number.isFinite(v) && v >= 0 ? v : 0);
            }}
          />
        </Field>
      )}

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
  staffAssignments,
  onStaffAssignmentChange,
  onOpeningFloatChange,
  initialReadings,
  onInitialReadingChange,
  isOpening,
  onSubmit,
  clock = DEFAULT_CLOCK,
  canChangePrice = false,
  openRefusal = null,
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

  /**
   * Dispensers being offered with nobody on them.
   *
   * This blocks the open rather than warning, because it is not correctable
   * afterwards: `shift_staff_assignments` is written only by `OpenShift`, and
   * no route adds one to a shift that is already running. An unassigned
   * dispenser therefore cannot be handed over for the life of that shift, and
   * the only way out is to close and re-open, discarding the opening
   * readings (#258).
   *
   * There is deliberately no "skip this pump for now" here. A pump nobody is
   * working is a pump that is not in use, which is what the dispenser's own
   * MAINTENANCE status already means — and the shift-status read filters those
   * out, so one never reaches this form. A short-staffed shift spreads one
   * attendant across several pumps instead.
   */
  const unattendedDispensers = useMemo(
    () =>
      (dispensers ?? []).filter(
        (du: any) => !staffAssignments.find((a) => a.duId === du.id)?.userId,
      ),
    [dispensers, staffAssignments],
  );
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
    control,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useZodForm<OpenShiftFormValues>(schema, {
    defaultValues: { shiftTemplateId: selectedTemplateId, businessDate },
    // React Hook Form syncs these from props, replacing three hand-rolled
    // setValue effects. `keepDirtyValues` leaves a field the operator has
    // already edited alone — which those effects could not express, so an
    // unrelated parent re-render used to overwrite a half-filled form.
    values: { shiftTemplateId: selectedTemplateId, businessDate },
    resetOptions: { keepDirtyValues: true },
  });
  const formTemplateId = watch('shiftTemplateId');
  const formBusinessDate = watch('businessDate');
  const selectedTemplate = templates.find((template: any) => template.id === formTemplateId);
  const knownOpenDate = openBusinessDays.some((day) => day.businessDate === formBusinessDate);
  const dateChoice = !customDateMode && knownOpenDate ? formBusinessDate : 'custom';
  const customDateHintId = useId();
  const futureDateId = useId();
  const futureDate = formBusinessDate > currentBusinessDate;

  // Rates for this shift (#619): each fuel's current price, which the shift
  // keeps for its whole life. A change scheduled inside the planned window
  // does not reach it; say so above Open shift.
  const fuels = useFuelPriceRows(stationId);
  const writes = useWriteStates(mutationKeys.fuelPrice(), fuelPriceWriteKey, stationId);
  const [changing, setChanging] = useState<{
    row: FuelPriceRow;
    attempt: FuelPriceAttempt | null;
  } | null>(null);
  const shiftTemplate = (templates as ShiftTemplateTimes[]).find((t) => t.id === formTemplateId);
  const changesDuringShift = useMemo(
    () =>
      scheduledChangesDuringShift(
        fuels.rows,
        shiftTemplate && formBusinessDate
          ? plannedShiftWindow(shiftTemplate, formBusinessDate, clock)
          : null,
        fuels.now,
      ),
    [fuels.rows, fuels.now, shiftTemplate, formBusinessDate, clock],
  );
  const changingDuringShift = useMemo(
    () => new Set(changesDuringShift.map((c) => c.productId)),
    [changesDuringShift],
  );
  // Fuels on a pump in service with no rate in effect block the open (#630).
  // Unknown until the rates load: the server decides, so nothing is blocked
  // on rates this screen has not read.
  const rateBlock = useMemo(
    () => (fuels.pricingQ.data ? fuelsBlockingOpen(nozzles ?? [], fuels.rows) : null),
    [fuels.pricingQ.data, fuels.rows, nozzles],
  );
  const withoutRate = useMemo(() => new Set(rateBlock?.productIds ?? []), [rateBlock]);
  const serverRefusal =
    openRefusal &&
    fuels.pricingQ.dataUpdatedAt <= openRefusal.at &&
    openRefusal.message !== rateBlock?.reason
      ? openRefusal.message
      : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    {formatBusinessDate(day.businessDate)} · Open
                    {day.businessDate > currentBusinessDate ? ' · Unavailable (future)' : ''}
                  </option>
                ))}
                <option value="custom">Custom Business Date</option>
              </Select>
            </Field>
            {dateChoice === 'custom' && (
              <Field
                label="Custom Business Date"
                messageId={customDateHintId}
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
                <Controller
                  control={control}
                  name="businessDate"
                  render={({ field }) => (
                    <DatePickerButton
                      ref={field.ref}
                      variant="field"
                      aria-label="Custom Business Date"
                      aria-describedby={
                        futureDate ? `${customDateHintId} ${futureDateId}` : customDateHintId
                      }
                      value={field.value ?? ''}
                      max={currentBusinessDate}
                      invalid={!!errors.businessDate}
                      onBlur={field.onBlur}
                      onChange={(date) => {
                        setPickedBusinessDate(date);
                        field.onChange(date);
                        // Checked on each pick, as the native field was.
                        void trigger('businessDate');
                      }}
                    />
                  )}
                />
                {futureDate && (
                  <div
                    id={futureDateId}
                    style={{ marginTop: '5px', color: 'var(--state-danger-fg)', fontSize: '12px' }}
                  >
                    Unavailable: future Business Dates cannot be used to open a Shift.
                  </div>
                )}
              </Field>
            )}
            <Field label="Opening cash (Σ floats)">
              <div className="font-mono" style={{ padding: '6px 0' }}>
                {inr(
                  staffAssignments
                    .filter((a) => a.userId)
                    .reduce((sum, a) => sum + (a.openingFloat || 0), 0),
                )}
              </div>
            </Field>
          </div>
        </Panel>

        <ShiftRatesPanel
          rows={fuels.rows}
          query={[fuels.pricingQ, fuels.historyQ, fuels.productsQ]}
          timeZone={clock.timeZone}
          writes={writes}
          changingDuringShift={changingDuringShift}
          withoutRate={withoutRate}
          onChangePrice={
            canChangePrice
              ? (row) =>
                  setChanging({ row, attempt: unconfirmedAttempt(writes.get(row.productId)) })
              : undefined
          }
        />

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
              Who is on each pump, and which POS is with them. Every pump in service needs an
              attendant — it cannot be given one after the shift opens. A POS is optional, and one
              left shift-wide is shared across pumps.
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
                  openingFloat={staffAssignments.find((a) => a.duId === du.id)?.openingFloat ?? 0}
                  terminalAssignments={terminalAssignments}
                  onStaffAssignmentChange={onStaffAssignmentChange}
                  onOpeningFloatChange={onOpeningFloatChange}
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

        {changesDuringShift.length > 0 && (
          <Banner severity="warning">
            <span className="flex flex-col gap-1" data-testid="shift-rate-warning">
              {changesDuringShift.map((c) => (
                <span key={c.productId}>{rateChangeWarning(c, clock.timeZone)}</span>
              ))}
            </span>
          </Banner>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {unattendedDispensers.length > 0 && (
            <p
              // A blocking validation message: announced, and the only stable
              // handle on it — the text spans several nodes.
              role="alert"
              style={{ ...sectionNote, marginBottom: 0, textAlign: 'right' }}
            >
              {/* Named, not counted: the operator has to know which card to go
                  back to, and on a wide grid "2 dispensers" does not say. */}
              {unattendedDispensers
                .map((du: any) => dispenserLabel({ duCode: du.code, duName: du.name }))
                .join(', ')}{' '}
              {unattendedDispensers.length === 1 ? 'needs an attendant' : 'need an attendant'} — a
              dispenser cannot be assigned one after the shift opens. Put a pump that is not in use
              into maintenance instead.
            </p>
          )}
          {(rateBlock || serverRefusal) && (
            <p
              // Blocking, like the attendant message: announced, and named so
              // the operator knows which rate to set.
              role="alert"
              data-testid="open-shift-rate-block"
              className="text-right text-[12px] text-danger-fg"
            >
              {serverRefusal ?? rateBlock?.reason}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isOpening}
            disabled={
              formBusinessDate > currentBusinessDate ||
              businessDayState === 'CLOSED' ||
              businessDayState === 'UNKNOWN' ||
              businessDayState === 'UNAVAILABLE' ||
              unattendedDispensers.length > 0 ||
              rateBlock != null
            }
            leftIcon={<Play style={{ fill: 'currentColor' }} />}
          >
            Start Shift Operations
          </Button>
        </div>
      </Form>
      {changing && (
        // Outside the form: the drawer's own submit must never open the shift.
        <ChangePriceDrawer
          stationId={stationId}
          timeZone={clock.timeZone}
          fuels={fuels.rows}
          initial={changing.row}
          attempt={changing.attempt}
          onClose={() => setChanging(null)}
        />
      )}
    </div>
  );
};
