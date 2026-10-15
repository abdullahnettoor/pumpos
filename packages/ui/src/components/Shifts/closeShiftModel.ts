import { z } from 'zod';
import { isBalancedVariance } from '@pump/shared';
import type { PendingTankDipWorkflow } from '../../query/stockCountMutation.js';
import type { ShiftCloseStep } from '../../nav-intent/routes.js';
import { toPaise } from '../../utils/ledgerWindow.js';
import { DRAWER_KEY, duText, n, type Num, type StaffAssignmentInput } from './liveShiftInputs.js';
import { VARIANCE_FLAG_RUPEES } from './drawerFigures.js';

/**
 * The Close shift page's figures and draft (#534). Pure: the page lays these
 * out. The cash maths itself is the shared `buildCloseCashSummary`; this
 * module shapes its Drawers into the Handovers table, keeps the operator's
 * in-progress count across a reload, and words the close warnings exactly as
 * the old wizard did.
 */

// ── The draft ───────────────────────────────────────────────────────────────

/** A Cash Drop recorded at close (#287): `drawerKey()` names the Drawer, '' none. */
export interface CloseDropRow {
  drawerKey: string;
  amount: number;
}

/** What the operator has entered on the Close shift page, before it is sent. */
export interface CloseDraft {
  /** The step they were on, so "Continue close" resumes it. */
  step: Exclude<ShiftCloseStep, 'done'>;
  closingCash: number;
  closeDrops: CloseDropRow[];
  /** The "I recorded physical dip readings" toggle. */
  recordDip: boolean;
  dipReadings: Record<string, number | string>;
  dipReasons: Record<string, string>;
  /** Denomination counts behind the counted cash. */
  cashBreakdown: Record<string, number>;
}

export const EMPTY_CLOSE_DRAFT: CloseDraft = {
  step: 'readings',
  closingCash: 0,
  closeDrops: [],
  recordDip: false,
  dipReadings: {},
  dipReasons: {},
  cashBreakdown: {},
};

/** Whether the draft holds anything the operator typed (the step alone is not progress). */
export function hasCloseProgress(draft: CloseDraft): boolean {
  return (
    draft.closingCash !== 0 ||
    draft.closeDrops.length > 0 ||
    Object.values(draft.dipReadings).some((v) => v !== '' && v != null) ||
    Object.values(draft.dipReasons).some((v) => v.trim() !== '')
  );
}

/** The tanks with a dip value entered. */
export const dipCount = (draft: Pick<CloseDraft, 'dipReadings'>): number =>
  Object.values(draft.dipReadings).filter((v) => v !== '' && v != null).length;

// ── Stored shapes, checked on the way back in ───────────────────────────────

const money = z.number().finite().nonnegative();

/** A stored draft: anything that does not match is discarded whole (#534 review). */
export const closeDraftSchema = z.object({
  step: z.enum(['readings', 'handovers', 'cash', 'confirm']),
  closingCash: money,
  closeDrops: z.array(z.object({ drawerKey: z.string(), amount: money })),
  recordDip: z.boolean(),
  dipReadings: z.record(z.union([money, z.literal('')])),
  dipReasons: z.record(z.string()),
  cashBreakdown: z.record(z.number().int().nonnegative()),
});

const tankDipSchema = z.object({
  tankId: z.string(),
  tankName: z.string(),
  actualQuantity: z.number().finite(),
  reason: z.string().optional(),
  status: z.enum(['pending', 'saving', 'saved', 'failed']),
  error: z.string().optional(),
  idempotencyKey: z.string(),
  expectedQuantity: z.number().finite().optional(),
  varianceQuantity: z.number().finite().optional(),
  warnings: z.array(z.string()).optional(),
});

/** A stored close outcome (`PendingTankDipWorkflow`): every field the closed state reads. */
export const closeOutcomeSchema = z.object({
  expectedCash: z.number().finite(),
  closingCash: z.number().finite(),
  variance: z.number().finite(),
  lastClosedShiftId: z.string().min(1),
  nextTemplateId: z.string(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currentBusinessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledStartTime: z.string().nullish(),
  scheduledEndTime: z.string().nullish(),
  openedAt: z.string().min(1),
  closedAt: z.string().min(1),
  timeZone: z.string().optional(),
  shiftName: z.string().nullish(),
  seenAt: z.number().finite().nonnegative().optional(),
  tankDips: z.array(tankDipSchema),
  closeStatus: z.enum(['submitting', 'closed']).optional(),
});

const parseJson = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** A stored draft, or the empty draft when it is missing or does not match. */
export function parseCloseDraft(raw: string | null): CloseDraft {
  const parsed = closeDraftSchema.safeParse(parseJson(raw));
  return parsed.success ? parsed.data : EMPTY_CLOSE_DRAFT;
}

/** A stored close outcome, or null when it is missing or does not match. */
export function parseCloseOutcome(value: unknown): PendingTankDipWorkflow | null {
  const parsed = closeOutcomeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Where a shift's close draft is kept: the tab's session storage, so a reload
 * or an accidental Back keeps it, but a counted figure never outlives the
 * session it was counted in.
 */
export const closeDraftKey = (stationId: string, shiftId: string) =>
  `pumpos:close-draft:${stationId}:${shiftId}`;

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> &
  Partial<Pick<Storage, 'key' | 'length'>>;

const sessionStore = (): DraftStorage | null =>
  typeof sessionStorage === 'undefined' ? null : sessionStorage;

export function loadCloseDraft(
  stationId: string,
  shiftId: string,
  storage: DraftStorage | null = sessionStore(),
): CloseDraft {
  try {
    return parseCloseDraft(storage?.getItem(closeDraftKey(stationId, shiftId)) ?? null);
  } catch {
    return EMPTY_CLOSE_DRAFT;
  }
}

export function saveCloseDraft(
  stationId: string,
  shiftId: string,
  draft: CloseDraft | null,
  storage: DraftStorage | null = sessionStore(),
): void {
  try {
    const key = closeDraftKey(stationId, shiftId);
    if (draft && (hasCloseProgress(draft) || draft.step !== 'readings')) {
      storage?.setItem(key, JSON.stringify(draft));
    } else storage?.removeItem(key);
  } catch {
    // Storage full or blocked: the draft lives on in memory only.
  }
}

/**
 * The cloud decides (#534 review): once the server says which shift is open,
 * every draft this tab kept for any other shift of the station is dropped,
 * so a draft never outlives a close made elsewhere or returns on a reopen.
 */
export function pruneCloseDrafts(
  stationId: string,
  openShiftId: string | null,
  storage: DraftStorage | null = sessionStore(),
): void {
  try {
    if (!storage?.key || storage.length == null) return;
    const prefix = closeDraftKey(stationId, '');
    const keep = openShiftId ? closeDraftKey(stationId, openShiftId) : null;
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(prefix) && k !== keep) stale.push(k);
    }
    stale.forEach((k) => storage.removeItem(k));
  } catch {
    // Nothing to prune when storage is blocked.
  }
}

/**
 * The close's outcome, kept for the tab session so a reload of the close
 * page's final state (`?step=done`) shows it again. Tank dips still to save
 * are kept separately (`savePendingTankDipWorkflow`), as before.
 */
export const closedResultKey = (stationId: string, shiftId: string) =>
  `pumpos:closed-shift:${stationId}:${shiftId}`;

export function saveClosedResult(
  stationId: string,
  shiftId: string,
  result: PendingTankDipWorkflow | null,
  storage: DraftStorage | null = sessionStore(),
): void {
  try {
    const key = closedResultKey(stationId, shiftId);
    if (result) storage?.setItem(key, JSON.stringify(result));
    else storage?.removeItem(key);
  } catch {
    // Not kept: a reload shows the plain "closed" state instead.
  }
}

/** A kept close outcome for this shift, or null (missing, malformed or another shift's). */
export function loadClosedResult(
  stationId: string,
  shiftId: string,
  storage: DraftStorage | null = sessionStore(),
): PendingTankDipWorkflow | null {
  try {
    const outcome = parseCloseOutcome(
      parseJson(storage?.getItem(closedResultKey(stationId, shiftId)) ?? null),
    );
    return outcome?.lastClosedShiftId === shiftId ? outcome : null;
  } catch {
    return null;
  }
}

/**
 * Whether a close outcome may still be shown, against the server's shift
 * status (#534 review). `wait` until the status is known; `show` when the
 * status predates the outcome (the close answered after the status was read)
 * or confirms it; `drop` once the shift is open again or another shift has
 * closed since.
 */
export function outcomeStanding(
  shiftId: string,
  seenAt: number,
  status: { activeShift?: { id: string } | null; lastShift?: { id: string } | null } | null,
  statusUpdatedAt: number,
): 'show' | 'wait' | 'drop' {
  if (!status) return 'wait';
  if (seenAt >= statusUpdatedAt) return 'show';
  if (status.activeShift?.id === shiftId) return 'drop';
  if (status.lastShift && status.lastShift.id !== shiftId) return 'drop';
  return 'show';
}

/**
 * The closed state's office cash, from the close response's snapshot where it
 * carries them (#534 review), else the figures the page sent.
 */
export function closeOutcomeFigures(
  snapshot: unknown,
  sent: { expectedCash: number; closingCash: number; variance: number },
): { expectedCash: number; closingCash: number; variance: number } {
  const snap =
    typeof snapshot === 'object' && snapshot !== null ? (snapshot as Record<string, unknown>) : {};
  const pick = (key: string, fallback: number) => {
    const v = snap[key];
    const x = typeof v === 'number' || typeof v === 'string' ? Number(v) : Number.NaN;
    return v !== null && v !== '' && Number.isFinite(x) ? x : fallback;
  };
  return {
    expectedCash: pick('expectedDrawerCash', sent.expectedCash),
    closingCash: pick('closingCash', sent.closingCash),
    variance: pick('cashVariance', sent.variance),
  };
}

/** The template after this shift's, round the station's list (the next shift to open). */
export function nextTemplateAfter(templates: { id: string }[], currentId?: string | null): string {
  if (templates.length === 0) return '';
  const i = templates.findIndex((t) => t.id === currentId);
  return i === -1 ? templates[0].id : templates[(i + 1) % templates.length].id;
}

// ── The cash count form ─────────────────────────────────────────────────────

/** An amount as typed: blank (none) or a figure of zero or more. */
const typedAmount = z
  .string()
  .refine(
    (v) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0),
    'Enter an amount of zero or more.',
  );

/** A denomination count as typed: blank (none) or a whole number of notes, zero or more. */
const typedCount = z
  .string()
  .refine(
    (v) => v.trim() === '' || (/^\d+$/.test(v.trim()) && Number.isSafeInteger(Number(v))),
    'Enter a whole number of notes, zero or more.',
  );

/**
 * The Cash count step's form (React Hook Form + Zod): the count, the drops at
 * close, and the denomination counts behind the count (whole, non-negative).
 */
export const cashCountSchema = z.object({
  closingCash: typedAmount,
  closeDrops: z.array(z.object({ drawerKey: z.string(), amount: typedAmount })),
  denominations: z.record(typedCount).optional(),
});

/** A denomination count's error through `cashCountSchema`, or null when it is a valid count. */
export function denominationCountError(raw: string): string | null {
  const parsed = cashCountSchema.shape.denominations.safeParse({ count: raw });
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Enter a whole number.');
}
export type CashCountFormValues = z.infer<typeof cashCountSchema>;

const typed = (v: number) => (v ? String(v) : '');

export const cashCountDefaults = (draft: CloseDraft): CashCountFormValues => ({
  closingCash: typed(draft.closingCash),
  closeDrops: draft.closeDrops.map((d) => ({ drawerKey: d.drawerKey, amount: typed(d.amount) })),
});

/** The valid form, as the draft holds it. */
export const cashCountToDraft = (
  v: CashCountFormValues,
): Pick<CloseDraft, 'closingCash' | 'closeDrops'> => ({
  closingCash: Number(v.closingCash) || 0,
  closeDrops: v.closeDrops.map((d) => ({ drawerKey: d.drawerKey, amount: Number(d.amount) || 0 })),
});

// ── The Handovers step: one row per Drawer ──────────────────────────────────

/** A Drawer as the close summary carries it (server recon, with drops at close). */
export interface CloseDrawerInput {
  attendantId: string;
  attendantName: string | null;
  duId?: string;
  duName: string | null;
  openingFloat: Num;
  cashSales: Num | null;
  cashDrops: Num;
  closeCashDrops?: Num;
  expectedCash: Num | null;
  cashHandedOver: Num | null;
  variance: Num | null;
}

export interface CloseDrawerRow {
  key: string;
  /** "DU1 · Ravi Kumar". */
  label: string;
  du: string;
  /** The staff assignment its Handover opens for; null when the Drawer has none. */
  assignment: StaffAssignmentInput | null;
  pending: boolean;
  openingFloat: number | null;
  cashSales: number | null;
  /** Drops on the Handover plus drops at close naming this Drawer. */
  drops: number | null;
  expected: number | null;
  declared: number | null;
  variance: number | null;
}

const orNull = (v: Num | null) => (v == null || v === '' ? null : n(v));

/**
 * The Drawers table: one row per Drawer, in dispenser order. From the server
 * reconciliation when it lists Drawers; otherwise (an older server) from the
 * staff assignments and their Handovers, which carry only the declared cash
 * and the variance.
 */
export function closeDrawerRows(input: {
  drawers: CloseDrawerInput[];
  assignments: StaffAssignmentInput[];
  handovers: {
    userId: string;
    duId: string;
    cashHandedOver?: Num;
    varianceAmount?: Num;
  }[];
}): CloseDrawerRow[] {
  const assignmentOf = (userId: string, duId?: string | null) =>
    input.assignments.find((a) => a.userId === userId && (!duId || a.duId === duId)) ?? null;
  const rows: CloseDrawerRow[] =
    input.drawers.length > 0
      ? input.drawers.map((d) => {
          const assignment = assignmentOf(d.attendantId, d.duId);
          const du = assignment ? duText(assignment) : d.duName || '';
          const pending = d.cashHandedOver == null;
          return {
            key: DRAWER_KEY(d.attendantId, d.duId ?? ''),
            label: [du, d.attendantName || 'Attendant'].filter(Boolean).join(' · '),
            du,
            assignment,
            pending,
            openingFloat: n(d.openingFloat),
            cashSales: orNull(d.cashSales),
            drops: (toPaise(d.cashDrops) + toPaise(d.closeCashDrops)) / 100,
            expected: orNull(d.expectedCash),
            declared: orNull(d.cashHandedOver),
            variance: orNull(d.variance),
          };
        })
      : input.assignments.map((a) => {
          const h = input.handovers.find((x) => x.userId === a.userId && x.duId === a.duId);
          return {
            key: DRAWER_KEY(a.userId, a.duId),
            label: `${duText(a)} · ${a.userName || 'Attendant'}`,
            du: duText(a),
            assignment: a,
            pending: !h,
            openingFloat: null,
            cashSales: null,
            drops: null,
            expected: null,
            declared: h ? n(h.cashHandedOver) : null,
            variance: h ? n(h.varianceAmount) : null,
          };
        });
  return rows.sort((a, b) =>
    a.du.localeCompare(b.du, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

export interface CloseDrawerTotal {
  /** Says what it leaves out: "Total excl. DU2, not handed over". */
  label: string;
  values: Record<'openingFloat' | 'cashSales' | 'drops' | 'expected' | 'declared', number | null>;
  variance: number;
}

/**
 * The Drawers table's total row: the handed-over Drawers only, labelled with
 * the ones it leaves out, so a total never mixes in half a Drawer. A column a
 * Drawer does not carry (the older-server fallback) totals blank.
 */
export function closeDrawerTotal(rows: CloseDrawerRow[]): CloseDrawerTotal {
  const done = rows.filter((r) => !r.pending);
  const pending = rows.filter((r) => r.pending);
  const sum = (pick: (r: CloseDrawerRow) => number | null) => {
    if (done.some((r) => pick(r) == null)) return null;
    return done.reduce((s, r) => s + toPaise(pick(r)), 0) / 100;
  };
  return {
    label: pending.length
      ? `Total excl. ${pending.map((r) => r.du || r.label).join(', ')}, not handed over`
      : 'Total',
    values: {
      openingFloat: sum((r) => r.openingFloat),
      cashSales: sum((r) => r.cashSales),
      drops: sum((r) => r.drops),
      expected: sum((r) => r.expected),
      declared: sum((r) => r.declared),
    },
    variance: done.reduce((s, r) => s + toPaise(r.variance), 0) / 100,
  };
}

/** The Drawers beyond the variance flag, for the Confirm step's review. */
export const flaggedDrawers = (rows: CloseDrawerRow[]): CloseDrawerRow[] =>
  rows.filter(
    (r) =>
      r.variance != null &&
      !isBalancedVariance(r.variance) &&
      Math.abs(r.variance) > VARIANCE_FLAG_RUPEES,
  );

// ── Readings and warnings (the old wizard's words, unchanged) ───────────────

export interface CloseReadingInput {
  nozzleId: string;
  nozzleName?: string | null;
  unit?: string | null;
  openingReading: Num;
}

/** A closing reading below its opening, as the old prepare-close check worded it. */
export function readingErrors(
  readings: CloseReadingInput[],
  closing: Record<string, number>,
): string[] {
  return readings.flatMap((nr) => {
    const opening = n(nr.openingReading);
    const value = closing[nr.nozzleId] ?? opening;
    return value < opening
      ? [
          `Closing reading for nozzle ${nr.nozzleName} (${value}) cannot be less than opening reading (${opening})`,
        ]
      : [];
  });
}

/**
 * What the operator must acknowledge before closing. The checks and their
 * words are the old wizard's: high volume, no fuel sold, Handovers not
 * recorded, credit chits vs customer billing, a ₹0 count, and an office count
 * beyond the variance flag.
 */
export function closeWarnings(input: {
  readings: CloseReadingInput[];
  closing: Record<string, number>;
  assignments: StaffAssignmentInput[];
  handovers: { userId: string; duId: string; creditHandedOver?: Num }[];
  /** Σ customer credit sales billed in the transaction panel. */
  creditSales: number;
  closingCash: number;
  expectedCash: number;
  formatMoney: (rupees: number) => string;
}): string[] {
  const warnings: string[] = [];
  const inr = input.formatMoney;
  let zero = 0;
  for (const nr of input.readings) {
    const opening = n(nr.openingReading);
    const volume = (input.closing[nr.nozzleId] ?? opening) - opening;
    if (volume === 0) zero++;
    if (volume > 5000) {
      warnings.push(
        `High volume alert: Nozzle ${nr.nozzleName} sold ${volume.toFixed(2)} ${nr.unit || 'L'}.`,
      );
    }
  }
  if (zero === input.readings.length) {
    warnings.push('Zero fuel volume was sold across all nozzles during this shift.');
  }
  for (const sa of input.assignments) {
    if (!input.handovers.some((h) => h.userId === sa.userId && h.duId === sa.duId)) {
      warnings.push(
        `Handover not recorded for attendant ${sa.userName} on dispenser ${sa.duName || 'DU'}.`,
      );
    }
  }
  const declaredCredit = input.handovers.reduce((s, h) => s + toPaise(h.creditHandedOver), 0) / 100;
  if (input.handovers.length > 0 && Math.abs(input.creditSales - declaredCredit) > 1.0) {
    warnings.push(
      `Credit Sales mismatch: Attendants declared ${inr(declaredCredit)} in chits, but only ${inr(input.creditSales)} of detailed customer billing has been logged in the transaction panel.`,
    );
  }
  if (input.closingCash === 0 && input.expectedCash > 0) {
    warnings.push('Closing cash is ₹0, indicating no collections entered.');
  }
  const variance = input.closingCash - input.expectedCash;
  if (Math.abs(variance) > VARIANCE_FLAG_RUPEES) {
    warnings.push(
      `Cash discrepancy detected! Variance is ${inr(variance)} (Expected: ${inr(input.expectedCash)}, Entered: ${inr(input.closingCash)})`,
    );
  }
  return warnings;
}
