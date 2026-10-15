import type { Station } from '@pump/shared';

/**
 * The in-page Station forms' drafts (#604): each form edits a draft built from
 * the saved station, and is dirty while the draft differs from it. Pure, so
 * the unsaved-changes bar's rule is tested apart from the page.
 */

/** Station › General: the details form. */
export interface GeneralDraft {
  name: string;
  code: string;
  address: string;
  phone: string;
  graceMinutes: number;
  timezone: string;
  businessDayStartsAt: string;
  onboardingStatus: string;
}

export function generalDraftOf(station: Station | null): GeneralDraft {
  return {
    name: station?.name ?? '',
    code: station?.code ?? '',
    address: station?.address || '',
    phone: station?.phone || '',
    graceMinutes: station?.settings?.shift_grace_minutes || 15,
    timezone: station?.settings?.timezone || 'Asia/Kolkata',
    businessDayStartsAt: station?.settings?.business_day_starts_at || '06:00',
    onboardingStatus: station?.onboardingStatus || 'NOT_STARTED',
  };
}

/** Station › Branding: the letterhead form. */
export interface BrandingDraft {
  legalName: string;
  gstin: string;
  stateCode: string;
  legalAddress: string;
  pincode: string;
  roCode: string;
  fuelBrand: string;
  logoDataUrl: string | null;
}

export function brandingDraftOf(station: Station | null): BrandingDraft {
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

/**
 * Whether a draft differs from what is saved. Compares the plain values a
 * form holds (strings, numbers, null, and nested plain objects such as the
 * decantation density bands); key order does not matter.
 */
export function draftDiffers(draft: unknown, saved: unknown): boolean {
  return !sameValue(draft, saved);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bk = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) =>
    sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
