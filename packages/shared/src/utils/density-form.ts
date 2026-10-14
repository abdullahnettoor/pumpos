import { z } from 'zod';
import {
  DEFAULT_DENSITY_TOLERANCE_KG_M3,
  density15FromObserved,
  roundDensity,
  type DensityMethod,
} from './density.js';
import type { DensityEntryMethod, RecordDensityReadingPayload } from '../types/density.js';

/** Physically valid density range (kg/m³), the same bounds the solver enforces. */
export const DENSITY_MIN_KG_M3 = 600;
export const DENSITY_MAX_KG_M3 = 1150;

/** "" -> null, otherwise the number (NaN when not numeric). */
export const parseOptionalNumber = (value: string): number | null =>
  value.trim() === '' ? null : Number(value);

/**
 * The Record Density form, as typed (all inputs are strings). Shared by every
 * client so the rules are written once; the server re-validates.
 */
export const recordDensityFormSchema = z
  .object({
    productId: z.string().min(1, 'Choose a fuel product'),
    kind: z.enum(['MORNING', 'ADHOC']),
    entryMethod: z.enum(['HYDROMETER', 'DIRECT_15']),
    sampledFrom: z.enum(['NONE', 'NOZZLE', 'TANK']),
    tankId: z.string(),
    nozzleId: z.string(),
    observedDensity: z.string(),
    observedTempC: z.string(),
    density15Direct: z.string(),
  })
  .superRefine((v, ctx) => {
    const inRange = (n: number | null) =>
      n != null && Number.isFinite(n) && n >= DENSITY_MIN_KG_M3 && n <= DENSITY_MAX_KG_M3;
    if (v.entryMethod === 'DIRECT_15') {
      if (!inRange(parseOptionalNumber(v.density15Direct)))
        ctx.addIssue({
          code: 'custom',
          path: ['density15Direct'],
          message: `Enter a density between ${DENSITY_MIN_KG_M3} and ${DENSITY_MAX_KG_M3} kg/m³`,
        });
      return;
    }
    if (!inRange(parseOptionalNumber(v.observedDensity)))
      ctx.addIssue({
        code: 'custom',
        path: ['observedDensity'],
        message: `Enter a density between ${DENSITY_MIN_KG_M3} and ${DENSITY_MAX_KG_M3} kg/m³`,
      });
    const temp = parseOptionalNumber(v.observedTempC);
    if (temp == null || !Number.isFinite(temp))
      ctx.addIssue({
        code: 'custom',
        path: ['observedTempC'],
        message: 'Enter the observed temperature',
      });
  });

export type RecordDensityFormValues = z.infer<typeof recordDensityFormSchema>;

/** Density at 15 °C for the form's current inputs, or null while they are incomplete/invalid. */
export function density15FromForm(
  v: Pick<
    RecordDensityFormValues,
    'entryMethod' | 'observedDensity' | 'observedTempC' | 'density15Direct'
  >,
  method: DensityMethod,
): number | null {
  if (v.entryMethod === 'DIRECT_15') {
    const direct = parseOptionalNumber(v.density15Direct);
    return direct != null &&
      Number.isFinite(direct) &&
      direct >= DENSITY_MIN_KG_M3 &&
      direct <= DENSITY_MAX_KG_M3
      ? roundDensity(direct, 2)
      : null;
  }
  const observed = parseOptionalNumber(v.observedDensity);
  const temp = parseOptionalNumber(v.observedTempC);
  if (observed == null || temp == null || !Number.isFinite(observed) || !Number.isFinite(temp))
    return null;
  try {
    return roundDensity(density15FromObserved(observed, temp, { method }), 2);
  } catch {
    return null;
  }
}

/** The API payload for a valid form. */
export function toRecordDensityPayload(
  stationId: string,
  v: RecordDensityFormValues,
  density15: number,
): RecordDensityReadingPayload {
  const entryMethod: DensityEntryMethod = v.entryMethod;
  return {
    stationId,
    productId: v.productId,
    kind: v.kind,
    entryMethod,
    sampledFrom: v.sampledFrom === 'NONE' ? null : v.sampledFrom,
    tankId: v.sampledFrom === 'TANK' ? v.tankId || null : null,
    nozzleId: v.sampledFrom === 'NOZZLE' ? v.nozzleId || null : null,
    ...(entryMethod === 'HYDROMETER'
      ? {
          observedDensity: parseOptionalNumber(v.observedDensity)!,
          observedTempC: parseOptionalNumber(v.observedTempC)!,
        }
      : { density15 }),
  };
}

/**
 * Whether a density change is beyond tolerance, judged on the change as shown
 * (1 decimal), so a `+3.0` never reads as a jump at tolerance 3. The one rule
 * for every density jump check on the client.
 */
export function densityChangeExceedsTolerance(delta: number, tolerance: number): boolean {
  return Math.abs(Math.round(delta * 10) / 10) > tolerance;
}

/**
 * Whether a register reading is an unexplained jump: the server flagged it, or
 * its delta exceeds tolerance and no Decantation explains it (kind DECANTATION).
 */
export function isUnexplainedDensityJump(r: {
  delta?: number | null;
  kind?: string;
  flags?: readonly unknown[] | null;
  tolerance?: number;
}): boolean {
  const flagged = Array.isArray(r.flags) && r.flags.some((f) => f === 'UNEXPLAINED_JUMP');
  const large =
    r.delta != null &&
    densityChangeExceedsTolerance(r.delta, r.tolerance ?? DEFAULT_DENSITY_TOLERANCE_KG_M3);
  return flagged || (large && r.kind !== 'DECANTATION');
}
