import type { OnboardingProductDraft } from '../types/entities.js';
import type { ProductTaxConfig, TaxCategory } from '../types/core.js';

/**
 * Default HSN heading for petroleum fuels (petrol/diesel fall under 2710).
 * Fuel is outside GST but still carries an HSN for invoicing/reporting.
 */
export const DEFAULT_FUEL_HSN = '2710';

/**
 * The VAT-shaped view of {@link ProductTaxConfig} that a fuel product carries:
 * a VAT rate and HSN, priced inclusively. It's a narrowing of the canonical
 * config (all fuel fields required), not a separate shape — there is no
 * `gst_rate`/`cess` on fuel.
 */
export type FuelVatConfig = Required<Pick<ProductTaxConfig, 'vat_rate' | 'hsn_code' | 'price_inclusive'>>;

/**
 * Canonical VAT-shaped tax config for a freshly created onboarding fuel draft.
 * Rates are captured per station out of band, so the draft starts at 0 and is
 * filled in later — but it is unambiguously VAT-shaped, never a 0% GST product.
 */
export function createFuelVatConfig(overrides: Partial<FuelVatConfig> = {}): FuelVatConfig {
  return {
    vat_rate: overrides.vat_rate ?? 0,
    hsn_code: overrides.hsn_code ?? DEFAULT_FUEL_HSN,
    // Pump prices are the pole rate the customer pays; VAT is embedded in it.
    price_inclusive: overrides.price_inclusive ?? true,
  };
}

/**
 * Coerce any fuel draft — fresh, quick-added, or a legacy GST-shaped draft
 * resumed from local storage — into the `FUEL_VAT` classification with a
 * VAT-shaped config. This is the single source of truth for the fuel tax
 * contract, shared by the onboarding UI, its validation, and the server-side
 * provisioner so a stale draft can never be persisted as a 0% GST product
 * (#133).
 *
 * Any `gst_rate`/`cess` from a legacy draft is dropped, not repurposed: a GST
 * rate is not a VAT rate (they're unrelated, state-specific numbers), so the
 * VAT rate falls back to 0 for an operator to set explicitly rather than
 * silently inheriting a stale GST figure.
 */
export function normalizeFuelTaxDraft(
  draft: OnboardingProductDraft,
): { taxCategory: TaxCategory; taxConfig: FuelVatConfig } {
  const cfg = draft.taxConfig ?? {};
  return {
    taxCategory: 'FUEL_VAT',
    taxConfig: createFuelVatConfig({
      vat_rate: typeof cfg.vat_rate === 'number' ? cfg.vat_rate : 0,
      hsn_code: cfg.hsn_code || DEFAULT_FUEL_HSN,
      price_inclusive: cfg.price_inclusive,
    }),
  };
}

/** True when a fuel draft is already stored as a clean `FUEL_VAT` product. */
export function isFuelVatDraft(draft: OnboardingProductDraft): boolean {
  const cfg = draft.taxConfig ?? {};
  return (
    draft.taxCategory === 'FUEL_VAT' &&
    cfg.gst_rate === undefined &&
    cfg.cess === undefined &&
    typeof cfg.vat_rate === 'number'
  );
}
