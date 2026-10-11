/**
 * Form model of the Decantation drawer (ADR 0007): values are strings as typed,
 * the Zod schema checks their shape, `buildSaveBody` maps them to the API body and
 * `liveFlags` previews the flags with the same rules the server applies
 * (`computeDecantationFlags`). The server stays authoritative.
 */
import { z } from 'zod';
import {
  computeDecantationFlags,
  type DecantationFlagResult,
  type DecantationView,
  type SaveDecantationBody,
} from '@pump/shared';

export type ChamberMarkValue = '' | 'OK' | 'SHORT' | 'EXCESS';

export interface DecantationLineValues {
  /** Existing line id when editing (keeps flag identity stable). */
  id?: string;
  tankId: string;
  beforeDip: string;
  /** RO Density at 15 °C. */
  roDensity: string;
  observedDensity: string;
  observedTempC: string;
  /** Measure this line now (after dip). Otherwise it waits for the next Tank Dip. */
  doAfterDip: boolean;
  afterDip: string;
  /** HH:mm, station time. */
  afterDipTime: string;
  salesDuring: string;
}

export interface DecantationChamberValues {
  capacity: string;
  /** Index into `lines`: the tank this chamber unloads into. */
  lineIndex: number;
  sealOk: boolean;
  mark: ChamberMarkValue;
  dipMm: string;
  emptied: boolean;
}

export interface DecantationFormValues {
  tankerNumber: string;
  driverName: string;
  notes: string;
  /** Station-time day of the unloading (YYYY-MM-DD). */
  date: string;
  unloadStart: string;
  unloadEnd: string;
  lines: DecantationLineValues[];
  checkChambers: boolean;
  chambers: DecantationChamberValues[];
  /** productId → purchaseId; blank = not linked (can be linked later). */
  links: Record<string, string>;
}

export const emptyLine = (tankId = ''): DecantationLineValues => ({
  tankId,
  beforeDip: '',
  roDensity: '',
  observedDensity: '',
  observedTempC: '',
  doAfterDip: false,
  afterDip: '',
  afterDipTime: '',
  salesDuring: '',
});

export const emptyChamber = (lineIndex = 0, capacity = ''): DecantationChamberValues => ({
  capacity,
  lineIndex,
  sealOk: true,
  mark: '',
  dipMm: '',
  emptied: false,
});

export const emptyDecantationForm = (date: string): DecantationFormValues => ({
  tankerNumber: '',
  driverName: '',
  notes: '',
  date,
  unloadStart: '',
  unloadEnd: '',
  lines: [emptyLine()],
  checkChambers: false,
  chambers: [],
  links: {},
});

/* ── Station-time helpers ─────────────────────────────────────────────── */

const partsIn = (ms: number, timeZone: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;
};

const offsetMs = (utcMs: number, timeZone: string) => {
  const p = partsIn(utcMs, timeZone);
  return (
    Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) -
    Math.floor(utcMs / 1000) * 1000
  );
};

/** `HH:mm` on `date` in the station time zone → UTC ISO instant. Blank → undefined. */
export function localTimeToIso(date: string, time: string, timeZone: string): string | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, +m[1], +m[2]);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone)).toISOString();
}

export function isoToLocalTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const p = partsIn(new Date(iso).getTime(), timeZone);
  return `${p.hour}:${p.minute}`;
}

const isoToLocalDate = (iso: string, timeZone: string) => {
  const p = partsIn(new Date(iso).getTime(), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instants of the visit's times: each is no earlier than the one before (overnight rolls over). */
export function visitInstants(v: DecantationFormValues, timeZone: string) {
  let floor = 0;
  const next = (time: string): string | undefined => {
    const iso = localTimeToIso(v.date, time, timeZone);
    if (!iso) return undefined;
    let ms = new Date(iso).getTime();
    while (ms < floor) ms += DAY_MS;
    floor = ms;
    return new Date(ms).toISOString();
  };
  const start = next(v.unloadStart);
  const end = next(v.unloadEnd);
  const afterDipAt = v.lines.map((l) => (l.doAfterDip ? next(l.afterDipTime) : undefined));
  return { start, end, afterDipAt };
}

/* ── Validation ───────────────────────────────────────────────────────── */

const quantity = z
  .string()
  .refine(
    (s) => s.trim() === '' || (Number.isFinite(Number(s)) && Number(s) >= 0),
    'Enter a number',
  );
const clock = z.string().refine((s) => s === '' || /^\d{1,2}:\d{2}$/.test(s), 'Use HH:mm');

export const decantationFormSchema = z.object({
  tankerNumber: z.string().trim().min(1, 'Tanker number is required').max(50),
  driverName: z.string().max(100),
  notes: z.string().max(500),
  date: z.string(),
  unloadStart: clock,
  unloadEnd: clock,
  checkChambers: z.boolean(),
  links: z.record(z.string()),
  lines: z
    .array(
      z.object({
        id: z.string().optional(),
        tankId: z.string().min(1, 'Choose the tank (a tank line needs it even in a draft)'),
        beforeDip: quantity,
        roDensity: quantity,
        observedDensity: quantity,
        observedTempC: z
          .string()
          .refine((s) => s.trim() === '' || Number.isFinite(Number(s)), 'Enter a number'),
        doAfterDip: z.boolean(),
        afterDip: quantity,
        afterDipTime: clock,
        salesDuring: quantity,
      }),
    )
    .min(1, 'Add at least one tank'),
  chambers: z.array(
    z.object({
      capacity: quantity,
      lineIndex: z.number().int().min(0),
      sealOk: z.boolean(),
      mark: z.enum(['', 'OK', 'SHORT', 'EXCESS']),
      dipMm: quantity,
      emptied: z.boolean(),
    }),
  ),
});

/* ── Mapping ──────────────────────────────────────────────────────────── */

export interface DecantationFormContext {
  stationId: string;
  timeZone: string;
  tanks: { id: string; productId: string }[];
  /** Invoice density of the picked Fuel Purchase, by product. */
  invoiceDensityByProduct: Record<string, number | null | undefined>;
  invoiceQtyByProduct: Record<string, number | null | undefined>;
  settings: { densityToleranceKgM3: number; settlingTimeMinutes: number };
}

const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));

const productOf = (ctx: DecantationFormContext, tankId: string) =>
  ctx.tanks.find((t) => t.id === tankId)?.productId;

const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** Products of the tank lines that have a picked Fuel Purchase. */
const linkedProducts = (v: DecantationFormValues, ctx: DecantationFormContext) =>
  [...new Set(v.lines.map((l) => productOf(ctx, l.tankId)))].filter(
    (p): p is string => !!p && !!v.links[p],
  );

export function buildSaveBody(
  v: DecantationFormValues,
  ctx: DecantationFormContext,
  opts: { draft: boolean },
): SaveDecantationBody {
  const at = visitInstants(v, ctx.timeZone);
  const products = linkedProducts(v, ctx);
  const invoiceQty = products.length
    ? sum(products.map((p) => ctx.invoiceQtyByProduct[p]))
    : undefined;
  const body: SaveDecantationBody = {
    stationId: ctx.stationId,
    tankerNumber: v.tankerNumber.trim(),
    chambersChecked: v.checkChambers,
    lines: v.lines.map((l, i) => {
      const productId = productOf(ctx, l.tankId);
      const measured = l.doAfterDip && l.afterDip.trim() !== '';
      return {
        ...(l.id ? { id: l.id } : {}),
        tankId: l.tankId,
        beforeDip: num(l.beforeDip) ?? 0,
        ...(num(l.roDensity) != null ? { roDensity: num(l.roDensity) } : {}),
        ...(num(l.observedDensity) != null ? { observedDensity: num(l.observedDensity) } : {}),
        ...(num(l.observedTempC) != null ? { observedTempC: num(l.observedTempC) } : {}),
        ...(measured
          ? {
              afterDip: num(l.afterDip),
              ...(at.afterDipAt[i] ? { afterDipAt: at.afterDipAt[i] } : {}),
              ...(num(l.salesDuring) != null ? { salesDuring: num(l.salesDuring) } : {}),
            }
          : {}),
        ...(productId && v.links[productId] && ctx.invoiceDensityByProduct[productId] != null
          ? { invoiceDensity: ctx.invoiceDensityByProduct[productId] }
          : {}),
      };
    }),
  };
  if (v.driverName.trim()) body.driverName = v.driverName.trim();
  if (v.notes.trim()) body.notes = v.notes.trim();
  if (at.start) body.unloadStartedAt = at.start;
  if (at.end) body.unloadEndedAt = at.end;
  if (invoiceQty) body.invoiceQuantity = invoiceQty;
  if (opts.draft) body.draft = true;
  if (v.checkChambers) {
    body.chambers = v.chambers.map((c, i) => ({
      chamberNo: i + 1,
      ...(num(c.capacity) != null ? { capacityL: num(c.capacity) } : {}),
      sealOk: c.sealOk,
      ...(c.mark ? { mark: c.mark } : {}),
      ...(num(c.dipMm) != null ? { dipMm: num(c.dipMm) } : {}),
      emptied: c.emptied,
      tankLineIndex: Math.min(c.lineIndex, v.lines.length - 1),
    }));
  }
  const links = Object.entries(v.links)
    .filter(([, purchaseId]) => !!purchaseId)
    .map(([productId, purchaseId]) => ({ productId, purchaseId }));
  if (links.length) body.links = links;
  return body;
}

/** Same flag rules as the server (`computeDecantationFlags`), previewed live. */
export function liveFlags(
  v: DecantationFormValues,
  ctx: DecantationFormContext,
): DecantationFlagResult {
  const at = visitInstants(v, ctx.timeZone);
  const products = linkedProducts(v, ctx);
  return computeDecantationFlags({
    lines: v.lines.map((l, i) => {
      const productId = productOf(ctx, l.tankId);
      return {
        id: String(i),
        roDensity: num(l.roDensity) ?? null,
        invoiceDensity:
          productId && v.links[productId] ? (ctx.invoiceDensityByProduct[productId] ?? null) : null,
        afterDipAt: l.doAfterDip && l.afterDip.trim() !== '' ? (at.afterDipAt[i] ?? null) : null,
      };
    }),
    chambersChecked: v.checkChambers,
    chambers: v.chambers.map((c, i) => ({
      chamberNo: i + 1,
      capacityL: num(c.capacity) ?? null,
      sealOk: c.sealOk,
      mark: c.mark || null,
      emptied: c.emptied,
    })),
    unloadEndedAt: at.end ?? null,
    invoiceQuantity: products.length ? sum(products.map((p) => ctx.invoiceQtyByProduct[p])) : null,
    densityToleranceKgM3: ctx.settings.densityToleranceKgM3,
    settlingTimeMinutes: ctx.settings.settlingTimeMinutes,
  });
}

const str = (n: number | null | undefined) => (n == null ? '' : String(n));

export function decantationToFormValues(
  d: DecantationView,
  timeZone: string,
): DecantationFormValues {
  const anchor =
    d.unloadStartedAt ?? d.lines.find((l) => l.beforeDipAt)?.beforeDipAt ?? d.createdAt;
  const date = anchor ? isoToLocalDate(anchor, timeZone) : (d.businessDate ?? '');
  const lineIndexById = new Map(d.lines.map((l, i) => [l.id, i]));
  return {
    tankerNumber: d.tankerNumber,
    driverName: d.driverName ?? '',
    notes: d.notes ?? '',
    date,
    unloadStart: isoToLocalTime(d.unloadStartedAt, timeZone),
    unloadEnd: isoToLocalTime(d.unloadEndedAt, timeZone),
    lines: d.lines.map((l) => ({
      id: l.id,
      tankId: l.tankId,
      beforeDip: str(l.beforeDip),
      roDensity: str(l.roDensity),
      observedDensity: str(l.observedDensity),
      observedTempC: str(l.observedTempC),
      doAfterDip: l.afterDip != null,
      afterDip: str(l.afterDip),
      afterDipTime: isoToLocalTime(l.afterDipAt, timeZone),
      salesDuring: l.salesDuring ? String(l.salesDuring) : '',
    })),
    checkChambers: d.chambersChecked,
    chambers: d.chambers.map((c) => ({
      capacity: str(c.capacityL),
      lineIndex: (c.tankLineId ? lineIndexById.get(c.tankLineId) : undefined) ?? 0,
      sealOk: c.sealOk ?? true,
      mark: c.mark ?? '',
      dipMm: str(c.dipMm),
      emptied: c.emptied ?? false,
    })),
    links: Object.fromEntries((d.links ?? []).map((l) => [l.productId, l.purchaseId])),
  };
}
