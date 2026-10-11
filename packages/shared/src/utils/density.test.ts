import { describe, expect, it } from 'vitest';
import {
  alpha15,
  classifyDensity15,
  density15FromObserved,
  densityDeviation,
  densityWithinTolerance,
  massKg,
  roundDensity,
  vcf,
  volumeAt15,
} from './density.js';

describe('density mathematics (@pump/shared)', () => {
  describe('classifyDensity15', () => {
    it('classifies gasoline (653 to 770 kg/m³)', () => {
      expect(classifyDensity15(745)).toBe('gasoline');
      expect(classifyDensity15(653)).toBe('gasoline');
      expect(classifyDensity15(770)).toBe('gasoline');
    });

    it('classifies transition band (770 to 787.5 kg/m³)', () => {
      expect(classifyDensity15(775)).toBe('transition');
      expect(classifyDensity15(787.5)).toBe('transition');
    });

    it('classifies jet / kerosene (787.5 to 839 kg/m³)', () => {
      expect(classifyDensity15(800)).toBe('jet');
      expect(classifyDensity15(828)).toBe('jet');
      expect(classifyDensity15(839)).toBe('jet');
    });

    it('classifies fuel oils (839 to 1075 kg/m³)', () => {
      expect(classifyDensity15(840.08)).toBe('fuel_oil');
      expect(classifyDensity15(1075)).toBe('fuel_oil');
    });

    it('throws RangeError for densities outside Table 54B range (653 to 1075 kg/m³)', () => {
      expect(() => classifyDensity15(600)).toThrow(RangeError);
      expect(() => classifyDensity15(1100)).toThrow(RangeError);
    });
  });

  describe('alpha15 (§2.1)', () => {
    it('verifies gasoline α15 check in §2.5 (MS ρ15 = 745 → 0.0012132 /°C)', () => {
      const alpha = alpha15(745);
      // 346.4228 / 745² + 0.4388 / 745 = 0.001213165...
      expect(alpha).toBeCloseTo(0.0012132, 6);
    });

    it('computes α15 for jet band (e.g. 840.0 with jet formula = 0.00084260)', () => {
      const alpha = alpha15(840, 'jet');
      expect(alpha).toBeCloseTo(0.0008426, 6);
    });

    it('computes α15 for fuel oil band (worked example iter 2: ρ15 = 840.08 → 0.00084368)', () => {
      const alpha = alpha15(840.08);
      // 186.9696 / 840.08² + 0.4862 / 840.08 = 0.00084368...
      expect(alpha).toBeCloseTo(0.00084368, 6);
    });

    it('computes transition band', () => {
      const alpha = alpha15(780);
      const expected = -0.00336312 + 2680.3206 / (780 * 780);
      expect(alpha).toBeCloseTo(expected, 8);
    });
  });

  describe('vcf (§2.2)', () => {
    it('returns 1.0 at reference temperature (15 °C)', () => {
      expect(vcf(828, 15)).toBe(1.0);
      expect(vcf(745, 15)).toBe(1.0);
    });

    it('computes CTL for worked example iter 2 (ρ15 = 840.08, T = 32 °C → 0.985598)', () => {
      const ctl = vcf(840.08, 32);
      expect(ctl).toBeCloseTo(0.985598, 5);
    });

    it('computes VCF for net receipt (ρ15 = 840.10, T = 30 °C → 0.987298)', () => {
      const ctl = vcf(840.1, 30);
      expect(ctl).toBeCloseTo(0.987298, 5);
    });
  });

  describe('density15FromObserved (§2.3 & §2.5 worked example)', () => {
    it('converges to 840.10 kg/m³ for sample: hydrometer 828.0 kg/m³ @ 32 °C', () => {
      const rho15 = density15FromObserved(828.0, 32.0);
      expect(roundDensity(rho15, 2)).toBe(840.1);
      expect(roundDensity(rho15, 1)).toBe(840.1);
    });

    it('accepts explicit API_MPMS_11_1_ADJUNCT method string', () => {
      const rho15 = density15FromObserved(828.0, 32.0, 'API_MPMS_11_1_ADJUNCT');
      expect(roundDensity(rho15, 2)).toBe(840.1);
    });

    it('accepts options object with method API_MPMS_11_1_ADJUNCT', () => {
      const rho15 = density15FromObserved(828.0, 32.0, {
        method: 'API_MPMS_11_1_ADJUNCT',
      });
      expect(roundDensity(rho15, 2)).toBe(840.1);
    });

    it('supports OMC_TABLE_53B method with glass hydrometer correction', () => {
      const rho15 = density15FromObserved(828.0, 32.0, 'OMC_TABLE_53B');
      // With glass correction: HYC = 1 - 0.000023*17 - 0.00000002*17^2 ≈ 0.999603
      // ρObsCorrected = 827.671, resulting in ~839.76 kg/m³
      expect(rho15).toBeCloseTo(839.76, 1);
    });

    it('returns observed density unchanged at exactly 15 °C', () => {
      expect(density15FromObserved(830.0, 15.0)).toBe(830.0);
      expect(density15FromObserved(745.0, 15.0)).toBe(745.0);
    });

    it('throws RangeError for observed density outside valid physical bounds', () => {
      expect(() => density15FromObserved(500, 25)).toThrow(RangeError);
      expect(() => density15FromObserved(1200, 25)).toThrow(RangeError);
    });
  });

  describe('volumeAt15 (§2.2 & §2.5)', () => {
    it('computes 15 °C volume for worked example (12,000 L @ 30 °C, ρ15 = 840.10 → 11,847.6 L)', () => {
      const v15 = volumeAt15(12000, 840.1, 30);
      expect(roundDensity(v15, 1)).toBe(11847.6);
    });

    it('returns observed volume at reference temperature 15 °C', () => {
      expect(volumeAt15(10000, 840.1, 15)).toBe(10000);
    });
  });

  describe('massKg (§2.4 & §2.5)', () => {
    it('computes mass for worked example (11,847.6 L × 840.10 kg/m³ ÷ 1000 = 9,953 kg)', () => {
      const mass = massKg(11847.6, 840.1);
      expect(Math.round(mass)).toBe(9953);
      expect(mass).toBeCloseTo(9953.17, 1);
    });
  });

  describe('densityWithinTolerance & densityDeviation (§2.5 & §5.3)', () => {
    it('verifies worked example invoice check: ρ15 = 840.10 vs invoice 842.0 (Δ -1.9 kg/m³, within ±3)', () => {
      expect(densityDeviation(840.1, 842.0)).toBeCloseTo(-1.9, 2);
      expect(densityWithinTolerance(840.1, 842.0, 3)).toBe(true);
    });

    it('rejects density difference outside tolerance', () => {
      expect(densityDeviation(840.1, 845.0)).toBeCloseTo(-4.9, 2);
      expect(densityWithinTolerance(840.1, 845.0, 3)).toBe(false);
    });

    it('defaults tolerance to 3 kg/m³ when omitted', () => {
      expect(densityWithinTolerance(840.1, 842.0)).toBe(true);
      expect(densityWithinTolerance(840.1, 844.0)).toBe(false);
    });

    it('handles exact tolerance boundary', () => {
      expect(densityWithinTolerance(840.0, 843.0, 3)).toBe(true);
      expect(densityWithinTolerance(843.0, 840.0, 3)).toBe(true);
    });
  });
});
