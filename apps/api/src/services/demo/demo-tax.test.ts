import { describe, expect, it } from 'vitest';
import { DEMO_DECANTATION_SETTINGS, DEMO_FUEL_TAX, demoFuelTax } from '@pump/db';

describe('demo station tax and decantation settings', () => {
  it('taxes demo fuels as VAT, never GST', () => {
    for (const fuel of Object.values(DEMO_FUEL_TAX)) {
      const tax = demoFuelTax(fuel);
      expect(tax.taxCategory).toBe('FUEL_VAT');
      expect(tax.isTaxable).toBe(false);
      expect(tax.taxConfig.vat_rate).toBeGreaterThan(0);
      expect(tax.taxConfig).not.toHaveProperty('gst_rate');
      expect(tax.taxConfig).toMatchObject({ hsn_code: '2710', price_inclusive: true });
    }
    expect(DEMO_FUEL_TAX.petrol.vatRate).toBe(30.08);
    expect(DEMO_FUEL_TAX.diesel.vatRate).toBe(22.76);
  });

  it('sets explicit decantation settings', () => {
    expect(DEMO_DECANTATION_SETTINGS).toMatchObject({
      densityToleranceKgM3: 3,
      settlingTimeMinutes: 30,
      densityEntryMethod: 'HYDROMETER',
    });
  });
});
