// Letterhead identity used by report PDFs (and GST invoices). Kept free of any
// @react-pdf/renderer import so consumers (views, settings) can use it without
// pulling the heavy PDF engine into the main bundle.

export interface Letterhead {
  legalName?: string;
  gstin?: string;
  stateCode?: string;
  addressLine?: string;
  pincode?: string;
  roCode?: string;
  contact?: string;
  fuelBrand?: string;
  logoDataUrl?: string | null;
  /** Whether the station's uploaded logo should render on report letterheads. Default true. */
  showLogo?: boolean;
}

/** Determine whether station logo should be shown on reports. Defaults to true. */
export function showLogoFromStation(station: any): boolean {
  const rc = station?.settings?.report_config;
  if (rc?.showStationLogo !== undefined) return rc.showStationLogo;
  if (rc?.showLogo !== undefined) return rc.showLogo;
  return true;
}

/** Map a station record (with settings.legal/fuel_brand/logo) to a Letterhead. */
export function letterheadFromStation(station: any): Letterhead | undefined {
  if (!station) return undefined;
  const set = station.settings || {};
  const legal = set.legal || {};
  return {
    legalName: legal.legalName || station.name,
    gstin: legal.gstin,
    stateCode: legal.stateCode,
    addressLine: legal.addressLine || station.address,
    pincode: legal.pincode,
    roCode: legal.roCode,
    fuelBrand: set.fuel_brand,
    logoDataUrl: set.logo_data_url,
    showLogo: showLogoFromStation(station),
  };
}

/** The Organization profile's details (`organizations.metadata`), as the form holds them. */
export interface OrganizationLetterheadInput {
  name?: string | null;
  metadata?: {
    legalName?: string | null;
    gstin?: string | null;
    stateCode?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
}

/**
 * Map the Organization profile to a Letterhead (#605), for its preview in the
 * printed letterhead band: the legal name (else the organization name), GSTIN,
 * address and contact (phone · email). Blank fields print nothing.
 */
export function letterheadFromOrganization(org: OrganizationLetterheadInput): Letterhead {
  const m = org.metadata ?? {};
  const text = (v: string | null | undefined) => v?.trim() || undefined;
  const contact = [text(m.phone), text(m.email)].filter(Boolean).join(' · ');
  return {
    legalName: text(m.legalName) || text(org.name),
    gstin: text(m.gstin)?.toUpperCase(),
    stateCode: text(m.stateCode),
    addressLine: text(m.address),
    contact: contact || undefined,
    showLogo: false,
  };
}
