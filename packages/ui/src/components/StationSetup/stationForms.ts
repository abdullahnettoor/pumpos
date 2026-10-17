import { z } from 'zod';
import {
  decantationSettingsSchema,
  resolveDecantationSettings,
  stationSchema,
  type DecantationSettings,
  type Station,
} from '@pump/shared';
import { letterheadFromStation, type Letterhead } from '../../services/reports/letterhead.js';

/**
 * The Station page's in-page forms (#604): each form's values built from the
 * saved station, its Zod schema, and the body it sends. React Hook Form owns
 * the editing and the dirty state; these stay pure so they are tested apart.
 */

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Station › General: the details form. Name and code follow the API's rules. */
export const stationGeneralSchema = z.object({
  name: stationSchema.shape.name,
  code: stationSchema.shape.code,
  address: z.string().max(500, 'Keep the address under 500 characters'),
  phone: z.string().max(50, 'Keep the phone under 50 characters'),
  graceMinutes: z
    .number({ invalid_type_error: 'Enter the grace period in minutes' })
    .int('Whole minutes only')
    .min(0, 'The grace period cannot be negative')
    .max(1440, 'At most 1440 minutes (a day)'),
  timezone: z.string().min(1, 'Pick a timezone'),
  businessDayStartsAt: z.string().regex(HH_MM, 'Enter a time as HH:MM'),
});
export type StationGeneralValues = z.input<typeof stationGeneralSchema>;

export function stationGeneralValues(station: Station | null): StationGeneralValues {
  return {
    name: station?.name ?? '',
    code: station?.code ?? '',
    address: station?.address || '',
    phone: station?.phone || '',
    graceMinutes: station?.settings?.shift_grace_minutes ?? 15,
    timezone: station?.settings?.timezone || 'Asia/Kolkata',
    businessDayStartsAt: station?.settings?.business_day_starts_at || '06:00',
  };
}

/**
 * The update body for General. Settings are merged over the saved ones; the
 * onboarding status is not part of this form (read-only on the page).
 */
export function stationGeneralBody(
  station: Station,
  values: z.output<typeof stationGeneralSchema>,
) {
  return {
    name: values.name,
    code: values.code,
    address: values.address,
    phone: values.phone,
    settings: {
      ...(station.settings || {}),
      shift_grace_minutes: values.graceMinutes,
      timezone: values.timezone,
      business_day_starts_at: values.businessDayStartsAt,
      shift_lock_grace_days: station.settings?.shift_lock_grace_days ?? 3,
      offline_warning_days: station.settings?.offline_warning_days ?? 3,
      offline_critical_days: station.settings?.offline_critical_days ?? 7,
    },
  };
}

const optional = (pattern: RegExp, message: string) =>
  z.string().refine((v) => v === '' || pattern.test(v), message);

/** Station › Branding: the letterhead form. Blank fields are allowed. */
export const stationBrandingSchema = z.object({
  legalName: z.string().max(255, 'Keep the name under 255 characters'),
  gstin: optional(/^[0-9A-Za-z]{15}$/, 'A GSTIN is 15 letters and digits').transform((v) =>
    v.toUpperCase(),
  ),
  stateCode: optional(/^\d{2}$/, 'A state code is 2 digits'),
  legalAddress: z.string().max(500, 'Keep the address under 500 characters'),
  pincode: optional(/^\d{6}$/, 'A pincode is 6 digits'),
  roCode: z.string().max(100, 'Keep the code under 100 characters'),
  fuelBrand: z.string(),
  logoDataUrl: z.string().nullable(),
});
export type StationBrandingValues = z.input<typeof stationBrandingSchema>;

export function stationBrandingValues(station: Station | null): StationBrandingValues {
  const legal = station?.settings?.legal;
  return {
    legalName: legal?.legalName || '',
    gstin: legal?.gstin || '',
    stateCode: legal?.stateCode || '',
    legalAddress: legal?.addressLine || '',
    pincode: legal?.pincode || '',
    roCode: legal?.roCode || '',
    fuelBrand: station?.settings?.fuel_brand || '',
    logoDataUrl: station?.settings?.logo_data_url || null,
  };
}

/** The update body for Branding: blanks are sent as null. */
export function stationBrandingBody(
  station: Station,
  values: z.output<typeof stationBrandingSchema>,
) {
  return {
    settings: {
      ...(station.settings || {}),
      legal: {
        legalName: values.legalName || null,
        gstin: values.gstin || null,
        stateCode: values.stateCode || null,
        addressLine: values.legalAddress || null,
        pincode: values.pincode || null,
        roCode: values.roCode || null,
      },
      fuel_brand: values.fuelBrand || null,
      logo_data_url: values.logoDataUrl || null,
    },
  };
}

/** Station › Rules › Decantation guidance: the shared schema, every field set. */
export const decantationGuidanceSchema = decantationSettingsSchema.required();

export function decantationGuidanceValues(station: Station | null): DecantationSettings {
  return resolveDecantationSettings(station?.settings);
}

type DensityBands = DecantationSettings['densitySpecBands'];

/** Sets one edge of a product's density band; an empty band is dropped. */
export function withDensityBand(
  bands: DensityBands,
  productId: string,
  edge: 'minKgM3' | 'maxKgM3',
  raw: string,
): DensityBands {
  const value = raw === '' ? undefined : Number(raw);
  const next = { ...bands };
  const band = { ...next[productId], [edge]: value };
  if (band.minKgM3 === undefined && band.maxKgM3 === undefined) delete next[productId];
  else
    next[productId] = {
      ...(band.minKgM3 === undefined ? {} : { minKgM3: band.minKgM3 }),
      ...(band.maxKgM3 === undefined ? {} : { maxKgM3: band.maxKgM3 }),
    };
  return next;
}

/** The update body for Decantation guidance, merged over the saved settings. */
export function decantationGuidanceBody(station: Station, values: DecantationSettings) {
  return { settings: { ...(station.settings || {}), ...values } };
}

/**
 * The station to build the next save on (#604 review): the incoming one,
 * unless it is the same station and older than the one a save returned (a
 * station list not refetched yet).
 */
export function newerStation(current: Station | null, incoming: Station | null): Station | null {
  if (!current || !incoming || current.id !== incoming.id) return incoming;
  return (incoming.updatedAt ?? '') >= (current.updatedAt ?? '') ? incoming : current;
}

/**
 * The letterhead the Branding form's values would print (#615 review): the
 * export's own builder (`letterheadFromStation`) over the station with these
 * values saved, so the preview keeps its fallbacks (the station's name and
 * address when Branding has none, the logo setting from Report templates).
 */
export function brandingLetterhead(station: Station, values: StationBrandingValues): Letterhead {
  const body = stationBrandingBody(station, {
    ...values,
    gstin: (values.gstin ?? '').toUpperCase(),
  });
  return letterheadFromStation({ ...station, settings: body.settings }) ?? {};
}
