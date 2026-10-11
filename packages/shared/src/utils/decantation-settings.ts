import { z } from 'zod';

export const DECANTATION_REFERENCE_TEMPERATURE_C = 15;

export const DECANTATION_DENSITY_METHODS = ['API_MPMS_11_1_ADJUNCT', 'OMC_TABLE_53B'] as const;
export type DecantationDensityMethod = (typeof DECANTATION_DENSITY_METHODS)[number];
export const DECANTATION_SETTINGS_KEYS = [
  'densityMethod',
  'densityToleranceKgM3',
  'quantityTolerance',
  'settlingTimeMinutes',
  'densitySpecBands',
] as const;

export const decantationDensitySpecBandSchema = z
  .object({
    minKgM3: z.number().finite().nonnegative().optional(),
    maxKgM3: z.number().finite().nonnegative().optional(),
  })
  .refine((band) => band.minKgM3 !== undefined || band.maxKgM3 !== undefined)
  .refine(
    (band) =>
      band.minKgM3 === undefined || band.maxKgM3 === undefined || band.minKgM3 <= band.maxKgM3,
  );

export const decantationSettingsSchema = z.object({
  densityMethod: z.enum(DECANTATION_DENSITY_METHODS).optional(),
  densityToleranceKgM3: z.number().finite().positive().max(100).optional(),
  /** Percentage of invoice quantity; 0.2 means a tolerance of 0.2%. */
  quantityTolerance: z.number().finite().min(0).max(100).optional(),
  settlingTimeMinutes: z.number().int().min(0).max(1440).optional(),
  densitySpecBands: z.record(decantationDensitySpecBandSchema).optional(),
});

export type DecantationSettingsInput = z.input<typeof decantationSettingsSchema>;

export type DecantationSettings = {
  densityMethod: DecantationDensityMethod;
  densityToleranceKgM3: number;
  /** Percentage of invoice quantity; 0.2 means a tolerance of 0.2%. */
  quantityTolerance: number;
  settlingTimeMinutes: number;
  /** Optional 15 °C density bounds keyed by product UUID. */
  densitySpecBands: Record<string, z.infer<typeof decantationDensitySpecBandSchema>>;
};

export const DEFAULT_DECANTATION_SETTINGS: DecantationSettings = {
  densityMethod: 'API_MPMS_11_1_ADJUNCT',
  densityToleranceKgM3: 3,
  quantityTolerance: 0.2,
  settlingTimeMinutes: 30,
  densitySpecBands: {},
};

export const DECANTATION_SETTINGS_KEY_SET: ReadonlySet<string> = new Set(DECANTATION_SETTINGS_KEYS);

/** Resolve supported decantation fields from the station settings JSONB. */
export function resolveDecantationSettings(raw: unknown): DecantationSettings {
  const candidate = raw && typeof raw === 'object' ? raw : {};
  const source = candidate as Record<string, unknown>;
  const densityMethod = decantationSettingsSchema.shape.densityMethod.safeParse(
    source.densityMethod,
  );
  const densityToleranceKgM3 = decantationSettingsSchema.shape.densityToleranceKgM3.safeParse(
    source.densityToleranceKgM3,
  );
  const quantityTolerance = decantationSettingsSchema.shape.quantityTolerance.safeParse(
    source.quantityTolerance,
  );
  const settlingTimeMinutes = decantationSettingsSchema.shape.settlingTimeMinutes.safeParse(
    source.settlingTimeMinutes,
  );
  const parsedBands: DecantationSettings['densitySpecBands'] = {};
  const storedBands = source.densitySpecBands;
  if (storedBands && typeof storedBands === 'object' && !Array.isArray(storedBands)) {
    for (const [productId, band] of Object.entries(storedBands)) {
      const parsedBand = decantationDensitySpecBandSchema.safeParse(band);
      if (parsedBand.success) parsedBands[productId] = parsedBand.data;
    }
  }

  return {
    densityMethod:
      'densityMethod' in source && densityMethod.success && densityMethod.data !== undefined
        ? densityMethod.data
        : DEFAULT_DECANTATION_SETTINGS.densityMethod,
    densityToleranceKgM3:
      'densityToleranceKgM3' in source &&
      densityToleranceKgM3.success &&
      densityToleranceKgM3.data !== undefined
        ? densityToleranceKgM3.data
        : DEFAULT_DECANTATION_SETTINGS.densityToleranceKgM3,
    quantityTolerance:
      'quantityTolerance' in source &&
      quantityTolerance.success &&
      quantityTolerance.data !== undefined
        ? quantityTolerance.data
        : DEFAULT_DECANTATION_SETTINGS.quantityTolerance,
    settlingTimeMinutes:
      'settlingTimeMinutes' in source &&
      settlingTimeMinutes.success &&
      settlingTimeMinutes.data !== undefined
        ? settlingTimeMinutes.data
        : DEFAULT_DECANTATION_SETTINGS.settlingTimeMinutes,
    densitySpecBands: parsedBands,
  };
}
