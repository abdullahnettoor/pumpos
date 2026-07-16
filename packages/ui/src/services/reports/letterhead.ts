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
  };
}
