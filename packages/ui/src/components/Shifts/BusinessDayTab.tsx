import React, { useEffect, useMemo, useRef, useState } from 'react';
import { canViewReports, formatStationDateTime } from '@pump/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  Panel,
  SectionHeader,
  StatusChip,
  VarianceChip,
  type KpiScope,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import {
  CloudShiftService,
  formatDecantationWarningSummary,
  type BusinessDayStatusItem,
} from '../../services/cloud.js';
import {
  formatClockInZone,
  formatDate,
  formatMoney,
  formatQuantity,
  formatShortDay,
} from '../../utils/format.js';
import { countOf } from '../../utils/ledgerWindow.js';
import {
  useBusinessDayStatus,
  useDailyDssr,
  useDailyDssrPreview,
  useShiftStatus,
  useInvalidateOperational,
  useCustomers,
  useDecantationDayCloseWarnings,
  queryKeys,
} from '../../query/hooks.js';
import { patchBusinessDayClosed } from '../../query/shiftStatusPatches.js';
import { useStationBusinessDate } from '../../hooks/useStationBusinessDate.js';
import { useRunTask } from '../../utils/runTask.js';
import { officeSubmitKeys, sendKeyed } from '../../office-records/submitKeys.js';
import { dayFigures, dayShifts, type DayShiftRow } from './businessDayModel.js';

const shiftService = new CloudShiftService();

interface BusinessDayTabProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  activeBusinessDayId?: string | null;
  requestedBusinessDate?: string | null;
  onBusinessDateSelected?: () => void;
  /** Dashboard "Review in Shifts": show only still-open past Business Days. */
  openPastDaysRequested?: boolean;
  /** Called once the request is applied, so the host can drop its intent. */
  onOpenPastDaysConsumed?: () => void;
  /**
   * Route elsewhere in the app. Used by "See older", which hands days beyond
   * the recent window to the Reports page's Daily DSSR list (#226).
   *
   * Required rather than optional (#244). Both shells pass it today, so this
   * fixes no live bug; it closes the failure mode, where a host that simply
   * omitted the prop would lose the only route to a day older than 14 days and
   * look exactly like a host that had no such feature. Now it will not compile.
   */
  onNavigate: (path: string) => void;
}

type DayFilter = 'all' | 'open-past';

/**
 * Business days (#533): the recent Business Days on the left of the page's
 * reading order, then the selected day — its tiles, the shifts in it and its
 * sales lines. The forecourt sales-day layer, visible even with no shift
 * open; Office Records use their Entry Date and live in the Daily Cash Book.
 * Composed live from the DSR preview (closed shifts + sales, purchases and
 * stock) without writing a snapshot. Owner/Manager closure generates the
 * immutable DSR snapshot and seals the day; a day can close when it has no
 * open Shift.
 */
export const BusinessDayTab: React.FC<BusinessDayTabProps> = ({
  selectedStation,
  userRole,
  activeBusinessDayId,
  requestedBusinessDate,
  onBusinessDateSelected,
  openPastDaysRequested,
  onOpenPastDaysConsumed,
  onNavigate,
}) => {
  const stationId = selectedStation?.id ?? null;
  const settings = (selectedStation?.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const currentBusinessDate = useStationBusinessDate(
    settings.timezone,
    settings.business_day_starts_at,
  );
  const [pickedBusinessDate, setPickedBusinessDate] = useState<string | null>(null);
  // A day the operator picked always wins. The requested date only applies
  // until then: if the parent ever failed to clear it, ordering it first would
  // override every subsequent click and strand them on that day.
  const businessDate = pickedBusinessDate ?? requestedBusinessDate ?? currentBusinessDate;

  const initializedStationId = useRef<string | null>(null);

  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const invalidateOperational = useInvalidateOperational();
  const runTask = useRunTask();
  const [closing, setClosing] = useState(false);
  const canClose = userRole === 'Owner' || userRole === 'Manager';

  const currentBusinessDayStatusQ = useBusinessDayStatus(stationId, currentBusinessDate, {
    enabled: !!stationId,
  });
  const businessDayStatusQ = useBusinessDayStatus(stationId, businessDate, {
    enabled: !!stationId,
  });
  const selectedState = businessDayStatusQ.data?.requestedState;
  const selectedBusinessDay = businessDayStatusQ.data?.requestedBusinessDay;
  const dayCloseWarningsQ = useDecantationDayCloseWarnings(stationId, selectedBusinessDay?.id, {
    enabled: !!stationId && !!selectedBusinessDay?.id && selectedState === 'OPEN' && canClose,
  });
  const previewQ = useDailyDssrPreview(stationId, businessDate, {
    enabled: !!stationId && (selectedState === 'OPEN' || selectedState === 'NOT_CREATED'),
  });
  const snapshotQ = useDailyDssr(stationId, businessDate, {
    enabled: !!stationId && selectedState === 'CLOSED',
  });
  const shiftStatusQ = useShiftStatus(stationId, { lite: true, enabled: !!stationId });
  const shiftStatus = shiftStatusQ.data;
  const activeShift = shiftStatus?.activeShift;

  // EOD-cycle customers still carrying a receivable that's expected cleared by
  // day close — surfaced as a (non-blocking) reminder before closing the day.
  const { data: dayCustomers } = useCustomers(true, {
    enabled: !!stationId && canClose && businessDate === currentBusinessDate,
  });
  const eodDueCustomers = useMemo(
    () =>
      businessDate === currentBusinessDate
        ? (dayCustomers || []).filter(
            (c: any) => c.settlementCycle === 'EOD' && Number(c.currentBalance || 0) > 0,
          )
        : [],
    [businessDate, currentBusinessDate, dayCustomers],
  );
  const eodDueTotal = eodDueCustomers.reduce(
    (s: number, c: any) => s + Number(c.currentBalance || 0),
    0,
  );
  const decantationWarnings = dayCloseWarningsQ.data;
  const decantationWarningCount = decantationWarnings
    ? new Set([
        ...decantationWarnings.pendingMeasurement,
        ...decantationWarnings.purchaseNotLinked.map(({ documentNumber }) => documentNumber),
        ...decantationWarnings.flagged,
        ...(decantationWarnings.unloading ?? []),
      ]).size
    : 0;

  const report = selectedState === 'CLOSED' ? snapshotQ.data : previewQ.data;
  const snap = report?.snapshotData ?? null;

  /**
   * The last 14 days, open AND closed. This replaces an open-days-only panel,
   * which made a closed day invisible — an operator had no way to reach, say,
   * 16 Sept from here at all. The server already orders it newest first and
   * already keeps any older still-open day in it.
   */
  const recentBusinessDays: BusinessDayStatusItem[] = useMemo(
    () => currentBusinessDayStatusQ.data?.recentBusinessDays ?? [],
    [currentBusinessDayStatusQ.data],
  );
  const recentFromBusinessDate: string | undefined =
    currentBusinessDayStatusQ.data?.recentFromBusinessDate;

  /**
   * "See older" hands the operator to the Reports page. The answer comes from
   * `guards.ts`, the same source the nav gates the route with — an inline role
   * list here could drift from it and offer a door that does not open.
   */
  const mayOpenReports = canViewReports(userRole);

  // "Review in Shifts" from the dashboard notice: narrow the list to the
  // still-open past days until the operator clears the filter.
  const [onlyOpenPast, setOnlyOpenPast] = useState(false);
  if (openPastDaysRequested && !onlyOpenPast) setOnlyOpenPast(true);
  useEffect(() => {
    if (openPastDaysRequested) onOpenPastDaysConsumed?.();
  }, [openPastDaysRequested, onOpenPastDaysConsumed]);
  const visibleBusinessDays = onlyOpenPast
    ? recentBusinessDays.filter(
        (day) => day.status === 'OPEN' && day.businessDate < currentBusinessDate,
      )
    : recentBusinessDays;

  useEffect(() => {
    if (
      !stationId ||
      initializedStationId.current === stationId ||
      currentBusinessDayStatusQ.isFetching ||
      shiftStatusQ.isFetching
    )
      return;
    const resolvedActiveBusinessDayId = activeShift?.businessDayId ?? activeBusinessDayId;
    // Looked up in the recent list, which the use-case guarantees contains
    // every open day at any age — so the separate open-days memo this replaced
    // bought only its `any`-typed re-sort, and the `status` filter kept here:
    // if the active shift's day has since closed, fall back to today rather
    // than preselecting a day the operator can no longer work in.
    const activeDay = recentBusinessDays.find(
      (day) => day.id === resolvedActiveBusinessDayId && day.status === 'OPEN',
    );
    setPickedBusinessDate(requestedBusinessDate || activeDay?.businessDate || currentBusinessDate);
    initializedStationId.current = stationId;
    if (requestedBusinessDate) onBusinessDateSelected?.();
  }, [
    stationId,
    activeBusinessDayId,
    activeShift?.businessDayId,
    requestedBusinessDate,
    currentBusinessDate,
    recentBusinessDays,
    currentBusinessDayStatusQ.isFetching,
    shiftStatusQ.isFetching,
    onBusinessDateSelected,
  ]);

  // A date requested by the shifts workspace wins until it is released. Derived
  // rather than copied into state, so it applies on the render it arrives on
  // instead of one frame later; releasing it is the only side effect left, and
  // it updates nothing here.
  useEffect(() => {
    if (!requestedBusinessDate) return;
    initializedStationId.current = stationId;
    onBusinessDateSelected?.();
  }, [requestedBusinessDate, stationId, onBusinessDateSelected]);
  const timeZone = settings.timezone;
  const status = selectedState;
  const hasOpenShift = !!activeShift && activeShift.businessDayId === selectedBusinessDay?.id;
  const reportQ = status === 'CLOSED' ? snapshotQ : previewQ;
  const figures = useMemo(() => dayFigures(snap), [snap]);
  const shifts = useMemo(
    () =>
      dayShifts({
        snap,
        businessDate,
        openShift: hasOpenShift ? activeShift : null,
      }),
    [snap, businessDate, hasOpenShift, activeShift],
  );
  const scope: KpiScope = businessDate === currentBusinessDate ? 'today' : { day: businessDate };

  const dayColumns = useMemo<TableColumn<BusinessDayStatusItem>[]>(
    () => [
      {
        id: 'date',
        header: 'Business day',
        kind: 'date',
        value: (d) => d.businessDate,
        cell: (d) => (
          <span className="font-semibold text-ink-strong">{formatDate(d.businessDate)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        kind: 'status',
        value: (d) => (d.status === 'OPEN' ? 'day-open' : 'day-sealed'),
        width: '16%',
      },
      {
        id: 'shifts',
        header: 'Shifts',
        kind: 'text',
        value: (d) => `${Number(d.closedShiftCount)} closed · ${Number(d.openShiftCount)} open`,
        width: '24%',
      },
      {
        id: 'activity',
        header: 'Last activity',
        kind: 'text',
        value: (d) => formatStationDateTime(d.lastActivityAt, timeZone),
        width: '28%',
      },
    ],
    [timeZone],
  );

  const shiftColumns = useMemo<TableColumn<DayShiftRow>[]>(
    () => [
      {
        id: 'shift',
        header: 'Shift',
        kind: 'text',
        value: (r) => r.template,
        cell: (r) => (
          <span className="flex flex-col">
            <span className="font-semibold text-ink-strong">{r.template}</span>
            <span className="font-mono text-[12px] text-ink-muted">{r.label}</span>
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        kind: 'status',
        value: (r) => (r.closedAt ? 'shift-closed' : 'shift-live'),
        width: '13%',
      },
      {
        id: 'closed',
        header: 'Closed at',
        kind: 'text',
        value: (r) => (r.closedAt ? formatClockInZone(r.closedAt, timeZone) : null),
        width: '13%',
      },
      {
        id: 'volume',
        header: 'Net volume',
        kind: 'qty',
        unit: 'L',
        value: (r) => r.netVolume,
        total: false,
        width: '15%',
      },
      {
        id: 'expected',
        header: 'Expected drawer',
        kind: 'money',
        value: (r) => r.expectedDrawerCash,
        width: '16%',
      },
      {
        id: 'variance',
        header: 'Office variance',
        kind: 'money',
        value: (r) => r.variance,
        cell: (r) => (r.variance == null ? '' : <VarianceChip amount={r.variance} size="md" />),
        width: '16%',
      },
    ],
    [timeZone],
  );
  const shiftTotal = useMemo<TotalRow>(
    () => ({ label: shifts.openCount > 0 ? 'Total excl. live shift' : 'Total' }),
    [shifts.openCount],
  );

  if (!selectedStation) {
    return (
      <p className="p-6 text-[13px] text-ink-muted">
        Please select a station to view the business day.
      </p>
    );
  }

  const handleCloseDay = async () => {
    if (!snap?.businessDayId || !stationId) return;
    const decantationNote = decantationWarningCount
      ? `\n\nDecantation warnings: ${formatDecantationWarningSummary(decantationWarnings!)}. You can still close the day.`
      : '';
    const eodNote =
      eodDueCustomers.length > 0
        ? `\n\n${eodDueCustomers.length} end-of-day customer${eodDueCustomers.length === 1 ? '' : 's'} still owe ${formatMoney(eodDueTotal)} that was expected to be collected today.`
        : '';
    const ok = await confirm({
      title: 'Close this business day?',
      message: `This generates the immutable DSR snapshot for ${formatDate(businessDate)} and seals sales and stock. Late financial entries remain available and are flagged separately.${decantationNote}${eodNote}`,
      confirmLabel: 'Close day',
    });
    if (!ok) return;
    try {
      setClosing(true);
      // One key per close; a retry after an unanswered close reuses it.
      const businessDayId: string = snap.businessDayId;
      const closed = await sendKeyed(
        officeSubmitKeys.session(`business-day:close:${businessDayId}`),
        { stationId, businessDayId, businessDate },
        (key) => shiftService.closeBusinessDay(businessDayId, stationId, { idempotencyKey: key }),
      );
      // The day reads Closed from the answer (#606); its DSR arrives with the refresh.
      patchBusinessDayClosed(qc, stationId, closed);
      // Closed: report it from the response; the caches refresh in the
      // background (caching rule 6). The day's DSSR snapshot only exists once
      // the close succeeds, so both the single-day and range views refetch.
      toast.success('Business day closed · DSR generated.');
      runTask(
        Promise.all([
          invalidateOperational(stationId),
          qc.invalidateQueries({ queryKey: queryKeys.dssr(stationId, businessDate) }),
          qc.invalidateQueries({ queryKey: queryKeys.dssrRangePrefix() }),
        ]),
        'Day closed, but the screen could not be refreshed.',
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to close the business day.');
    } finally {
      setClosing(false);
    }
  };

  const openPastCount = recentBusinessDays.filter(
    (day) => day.status === 'OPEN' && day.businessDate < currentBusinessDate,
  ).length;
  const selectedDay = recentBusinessDays.find((d) => d.businessDate === businessDate);
  const liveAsOf =
    status !== 'CLOSED' && report?.live && report?.generatedAt
      ? formatClockInZone(report.generatedAt, timeZone)
      : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2" aria-label="Recent business days">
        <SectionHeader
          title="Business days"
          subtitle={
            recentFromBusinessDate ? `Since ${formatDate(recentFromBusinessDate)}` : undefined
          }
          controls={{
            filters: currentBusinessDayStatusQ.data && (
              <FilterChips<DayFilter>
                aria-label="Business days shown"
                options={[
                  { value: 'all', label: 'All', count: recentBusinessDays.length },
                  {
                    value: 'open-past',
                    label: 'Open past days',
                    count: openPastCount,
                  },
                ]}
                value={onlyOpenPast ? 'open-past' : 'all'}
                onChange={(v) => setOnlyOpenPast(v === 'open-past')}
              />
            ),
            actions: mayOpenReports ? (
              <Button variant="ghost" size="sm" onClick={() => onNavigate('/reports')}>
                See older Business Days
              </Button>
            ) : undefined,
          }}
        />
        <DataSection
          title="business days"
          query={currentBusinessDayStatusQ}
          placeholderHeight={200}
          flush
          isEmpty={visibleBusinessDays.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="calendar-range" size="md" />}
                title={
                  onlyOpenPast
                    ? 'No open past Business Days'
                    : recentFromBusinessDate
                      ? `No Business Days since ${formatDate(recentFromBusinessDate)}`
                      : 'No recent Business Days'
                }
                description="Open a shift to start a Business Day, or see older days in Reports."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={dayColumns}
            rows={visibleBusinessDays}
            rowKey={(d) => d.id}
            selectedRowId={selectedDay?.id ?? null}
            onRowClick={(d) => setPickedBusinessDate(d.businessDate)}
            rowLabel={(d) => formatDate(d.businessDate)}
            title="business days"
          />
        </DataSection>
      </section>

      <section className="flex flex-col gap-3" aria-label="Selected business day">
        <SectionHeader
          title={`Business day ${formatShortDay(businessDate)}`}
          subtitle={
            businessDayStatusQ.isError ? undefined : !status ? undefined : status ===
              'NOT_CREATED' ? (
              'Not started'
            ) : (
              <span className="inline-flex items-center gap-2">
                <StatusChip status={status === 'CLOSED' ? 'day-sealed' : 'day-open'} size="md" />
                {liveAsOf && <span>Live · as of {liveAsOf}</span>}
              </span>
            )
          }
          controls={
            status === 'OPEN' && canClose && snap
              ? {
                  actions: (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Icon name="lock" size="xs" />}
                      loading={closing}
                      disabled={hasOpenShift}
                      title={
                        hasOpenShift
                          ? 'Close the active shift before closing the business day'
                          : 'Generate the DSR snapshot and lock this day'
                      }
                      onClick={handleCloseDay}
                    >
                      Close business day
                    </Button>
                  ),
                }
              : undefined
          }
        />

        {hasOpenShift && status === 'OPEN' && canClose && snap && (
          <Banner severity="warning">
            A shift is still open. Close the active shift before closing the business day.
          </Banner>
        )}
        {status === 'OPEN' && canClose && eodDueCustomers.length > 0 && (
          <Banner severity="warning">
            {eodDueCustomers.length} end-of-day customer{eodDueCustomers.length === 1 ? '' : 's'}{' '}
            still owe{eodDueCustomers.length === 1 ? 's' : ''} {formatMoney(eodDueTotal)} expected
            to be collected before day close —{' '}
            {eodDueCustomers
              .slice(0, 3)
              .map((c: any) => c.name)
              .join(', ')}
            {eodDueCustomers.length > 3 ? ` +${eodDueCustomers.length - 3} more` : ''}. You can
            still close the day.
          </Banner>
        )}
        {status === 'OPEN' && canClose && decantationWarningCount > 0 && (
          <Banner severity="warning">
            Decantation warnings through this day:{' '}
            {formatDecantationWarningSummary(decantationWarnings!)}. You can still close the day.
          </Banner>
        )}

        <DataSection
          title="the business day"
          query={[businessDayStatusQ, reportQ]}
          shape="cards"
          placeholderHeight={320}
          enabled={!!stationId}
          isEmpty={!snap}
          empty={
            <Panel>
              <EmptyState
                compact
                icon={<Icon name="calendar-range" size="md" />}
                title="No activity yet"
                description="This business day opens automatically with the first shift or sale."
              />
            </Panel>
          }
        >
          <div className="flex flex-col gap-4">
            <KpiStrip columns="auto" scope={scope}>
              <KpiTile
                label="Fuel sold"
                value={formatQuantity(figures.netVolume, 'L')}
                hint={`${countOf(figures.shiftsIncluded, 'closed shift', 'closed shifts')}`}
              />
              <KpiTile
                label="Sales"
                value={formatMoney(figures.revenue)}
                hint={`Fuel ${formatMoney(figures.revenueFuel, { decimals: 0 })} · Products ${formatMoney(figures.revenueProducts, { decimals: 0 })}`}
              />
              <KpiTile
                label="Credit sales"
                value={formatMoney(figures.creditTotal)}
                hint={`Fleet ${formatMoney(figures.fleetCredit, { decimals: 0 })}`}
              />
              <KpiTile
                label="Gross margin"
                value={formatMoney(figures.grossMargin)}
                alert={figures.grossMargin < 0 ? 'danger' : undefined}
                hint={`COGS ${formatMoney(figures.cogs, { decimals: 0 })}`}
              />
            </KpiStrip>

            {status !== 'CLOSED' && (
              <Banner severity="info">
                Provisional: {countOf(figures.shiftsIncluded, 'closed shift', 'closed shifts')} plus
                live product sales, credit and purchases. Office money is in Accounts → Daily cash
                book.
                {hasOpenShift
                  ? " Fuel from the open shift isn't counted until it closes."
                  : ' Fuel for a shift is counted once that shift closes.'}
              </Banner>
            )}
            {status === 'CLOSED' && Number(report?.lateEntryCount ?? 0) > 0 && (
              <Banner severity="warning">
                {Number(report.lateEntryCount)} financial{' '}
                {Number(report.lateEntryCount) === 1 ? 'entry was' : 'entries were'} recorded after
                this day closed. The DSR snapshot is unchanged.
              </Banner>
            )}

            <section className="flex flex-col gap-2" aria-label="Shifts in this day">
              <SectionHeader
                title="Shifts in this day"
                subtitle={countOf(shifts.rows.length, 'shift', 'shifts')}
              />
              <div className="overflow-hidden rounded-card border border-border-soft bg-surface">
                {shifts.rows.length === 0 ? (
                  <div className="p-3">
                    <EmptyState
                      compact
                      icon={<Icon name="shifts" size="md" />}
                      title="No shifts yet"
                      description="No shift has been opened for this business day yet."
                    />
                  </div>
                ) : (
                  <InteractiveTable
                    bare
                    columns={shiftColumns}
                    rows={shifts.rows}
                    rowKey={(r) => r.shiftId}
                    totalRow={shiftTotal}
                    title="shifts in this day"
                  />
                )}
              </div>
            </section>

            <Panel title="Credit, purchases & products">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2">
                {(
                  [
                    ['Credit · regular', figures.normalCredit],
                    ['Credit · fleet', figures.fleetCredit],
                    ['Purchases', figures.purchases],
                    ['Product sales', figures.productSales],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="font-mono tabular-nums text-ink-default">
                      {formatMoney(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </DataSection>
      </section>
    </div>
  );
};
