import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FUEL_HSN,
  createFuelVatConfig,
  isFuelVatDraft,
  normalizeFuelTaxDraft,
} from './onboarding-tax.js';
import type { OnboardingProductDraft } from '../types/entities.js';

const draft = (over: Partial<OnboardingProductDraft>): OnboardingProductDraft => ({
  draftId: 'p1',
  name: 'Petrol',
  code: 'MS',
  productType: 'FUEL',
  stockTracked: true,
  isTaxable: false,
  taxCategory: 'FUEL_VAT',
  unit: 'L',
  taxConfig: createFuelVatConfig(),
  isActive: true,
  currentPrice: 100,
  ...over,
});

describe('createFuelVatConfig', () => {
  it('defaults to a VAT-shaped, inclusive config on the fuel HSN', () => {
    expect(createFuelVatConfig()).toEqual({
      vat_rate: 0,
      hsn_code: DEFAULT_FUEL_HSN,
      price_inclusive: true,
    });
  });

  it('carries overrides through', () => {
    expect(createFuelVatConfig({ vat_rate: 20, hsn_code: '2711' })).toEqual({
      vat_rate: 20,
      hsn_code: '2711',
      price_inclusive: true,
    });
  });
});

describe('normalizeFuelTaxDraft', () => {
  it('keeps a clean FUEL_VAT draft VAT-shaped', () => {
    const { taxCategory, taxConfig } = normalizeFuelTaxDraft(
      draft({ taxConfig: createFuelVatConfig({ vat_rate: 20 }) }),
    );
    expect(taxCategory).toBe('FUEL_VAT');
    expect(taxConfig.vat_rate).toBe(20);
    expect(taxConfig).not.toHaveProperty('gst_rate');
  });

  it('re-homes a legacy GST-shaped draft onto FUEL_VAT and drops gst_rate', () => {
    const { taxCategory, taxConfig } = normalizeFuelTaxDraft(
      // @ts-expect-error legacy draft carried a gst_rate and no explicit category
      draft({ taxCategory: undefined, taxConfig: { gst_rate: 0, hsn_code: '2710' } }),
    );
    expect(taxCategory).toBe('FUEL_VAT');
    expect(taxConfig.vat_rate).toBe(0);
    expect(taxConfig).not.toHaveProperty('gst_rate');
    expect(taxConfig.hsn_code).toBe('2710');
  });

  it('carries a legacy rate parked under gst_rate over to vat_rate', () => {
    const { taxConfig } = normalizeFuelTaxDraft(
      // @ts-expect-error legacy draft
      draft({ taxCategory: undefined, taxConfig: { gst_rate: 15, hsn_code: '2710' } }),
    );
    expect(taxConfig.vat_rate).toBe(15);
  });
});

describe('isFuelVatDraft', () => {
  it('is true for a clean FUEL_VAT draft', () => {
    expect(isFuelVatDraft(draft({}))).toBe(true);
  });

  it('is false when a gst_rate is still present', () => {
    // @ts-expect-error legacy shape
    expect(isFuelVatDraft(draft({ taxConfig: { gst_rate: 0, vat_rate: 0 } }))).toBe(false);
  });

  it('is false when the category is not FUEL_VAT', () => {
    expect(isFuelVatDraft(draft({ taxCategory: 'GST' }))).toBe(false);
  });
});
