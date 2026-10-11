/**
 * Density and Volume Correction Factor (VCF) mathematics.
 *
 * Implements ASTM D1250-19e1 / API MPMS Chapter 11.1 (Adjunct algorithm)
 * and Table 53B / 54B generalized refined products standard at 15 °C reference.
 *
 * References:
 * - ASTM D1250 / API MPMS Ch. 11.1 (1980 & 2004 Adjunct at 1 atm)
 * - Research doc: docs/research/decantation-and-density.md (§2 & §5.3)
 * - ADR 0007: docs/adr/0007-decantation-owns-fuel-stock.md
 */

export const REFERENCE_TEMPERATURE_C = 15;

export const DENSITY_METHODS = ['API_MPMS_11_1_ADJUNCT', 'OMC_TABLE_53B'] as const;
export type DensityMethod = (typeof DENSITY_METHODS)[number];

export const DEFAULT_DENSITY_METHOD: DensityMethod = 'API_MPMS_11_1_ADJUNCT';
export const DEFAULT_DENSITY_TOLERANCE_KG_M3 = 3;

export type ProductDensityClass = 'gasoline' | 'transition' | 'jet' | 'fuel_oil';

export interface Density15Options {
  /** Method selection: API_MPMS_11_1_ADJUNCT or OMC_TABLE_53B. */
  method?: DensityMethod;
  /** Explicitly toggle soda-lime glass hydrometer thermal expansion correction (HYC). */
  glassCorrection?: boolean;
  /** Maximum iterations for convergence (default: 20). */
  maxIterations?: number;
  /** Convergence tolerance in kg/m³ (default: 0.001). */
  tolerance?: number;
  /** Optional class override (otherwise automatically classified by ρ15). */
  productClass?: ProductDensityClass;
}

/**
 * Classifies refined product into Table 54B commodity group based on density at 15 °C.
 * Per ASTM D1250, products are classified strictly by standard density, not commercial name.
 */
export function classifyDensity15(rho15: number): ProductDensityClass {
  if (rho15 < 653 || rho15 > 1075) {
    throw new RangeError(
      'Density ' + rho15 + ' kg/m³ is outside the Table 54B standard range (653 to 1075 kg/m³)',
    );
  }
  if (rho15 <= 770) {
    return 'gasoline';
  }
  if (rho15 <= 787.5) {
    return 'transition';
  }
  if (rho15 <= 839) {
    return 'jet';
  }
  return 'fuel_oil';
}

function normalizeClass(raw?: ProductDensityClass | string): ProductDensityClass | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[\s-]/g, '_');
  if (s === 'gasoline' || s === 'motor_spirit' || s === 'petrol' || s === 'ms') return 'gasoline';
  if (s === 'transition') return 'transition';
  if (s === 'jet' || s === 'kerosene' || s === 'atf' || s === 'skoo') return 'jet';
  if (s === 'fuel_oil' || s === 'fuel_oils' || s === 'diesel' || s === 'hsd') return 'fuel_oil';
  return undefined;
}

/**
 * Computes thermal expansion coefficient α15 at reference 15 °C.
 * Formula: α15 = K0 / ρ15² + K1 / ρ15 (transition: α15 = A + B / ρ15²)
 */
export function alpha15(rho15: number, productClass?: ProductDensityClass | string): number {
  const cls = normalizeClass(productClass) ?? classifyDensity15(rho15);
  switch (cls) {
    case 'gasoline':
      return 346.4228 / (rho15 * rho15) + 0.4388 / rho15;
    case 'transition':
      return -0.00336312 + 2680.3206 / (rho15 * rho15);
    case 'jet':
      return 594.5418 / (rho15 * rho15);
    case 'fuel_oil':
      return 186.9696 / (rho15 * rho15) + 0.4862 / rho15;
  }
}

/**
 * Volume Correction Factor (CTL - Correction for Temperature on Liquid).
 *
 * ΔT  = tempC - 15
 * VCF = exp( -α15 · ΔT · (1 + 0.8 · α15 · ΔT) )
 */
export function vcf(
  rho15: number,
  tempC: number,
  productClass?: ProductDensityClass | string,
): number {
  const dt = tempC - REFERENCE_TEMPERATURE_C;
  if (Math.abs(dt) < 1e-12) {
    return 1.0;
  }
  const alpha = alpha15(rho15, productClass);
  const alphaDt = alpha * dt;
  return Math.exp(-alphaDt * (1.0 + 0.8 * alphaDt));
}

/**
 * Calculates standard density at 15 °C (ρ15) from observed density and temperature.
 *
 * Iterative Table 53B solver:
 * ρ15₀ = ρ_target
 * repeat: ρ15ₙ₊₁ = ρ_target / CTL(ρ15ₙ, T) until |Δ| < tolerance
 *
 * If OMC_TABLE_53B or glassCorrection is enabled, applies soda-lime glass hydrometer
 * thermal expansion correction factor (HYC):
 * HYC = 1 - 0.000023·ΔT - 0.00000002·ΔT²
 */
export function density15FromObserved(
  rhoObs: number,
  tempC: number,
  optionsOrMethod?: Density15Options | DensityMethod,
): number {
  if (rhoObs < 600 || rhoObs > 1150) {
    throw new RangeError(
      'Observed density ' + rhoObs + ' kg/m³ is outside physically valid range (600 to 1150 kg/m³)',
    );
  }

  const options: Density15Options =
    typeof optionsOrMethod === 'string' ? { method: optionsOrMethod } : (optionsOrMethod ?? {});

  const method = options.method ?? DEFAULT_DENSITY_METHOD;
  const useGlassCorrection = options.glassCorrection ?? method === 'OMC_TABLE_53B';
  const maxIterations = options.maxIterations ?? 20;
  const tol = options.tolerance ?? 0.001;

  const dt = tempC - REFERENCE_TEMPERATURE_C;

  // Hydrometer thermal expansion correction factor (HYC)
  const hyc = useGlassCorrection ? 1.0 - 0.000023 * dt - 0.00000002 * (dt * dt) : 1.0;

  const targetDensity = rhoObs * hyc;

  if (Math.abs(dt) < 1e-12 && !useGlassCorrection) {
    return rhoObs;
  }

  let current = targetDensity;
  for (let i = 0; i < maxIterations; i++) {
    const c = vcf(current, tempC, options.productClass);
    const next = targetDensity / c;
    if (Math.abs(next - current) < tol) {
      return next;
    }
    current = next;
  }

  return current;
}

/**
 * Calculates volume corrected to standard temperature 15 °C (V15).
 * V15 = V_observed × VCF
 */
export function volumeAt15(
  vObs: number,
  rho15: number,
  tempC: number,
  productClass?: ProductDensityClass | string,
): number {
  return vObs * vcf(rho15, tempC, productClass);
}

/**
 * Calculates mass in kilograms from standard volume at 15 °C (in Litres) and ρ15 (in kg/m³).
 * mass (kg) = V15 (L) × ρ15 (kg/m³) ÷ 1000
 */
export function massKg(v15: number, rho15: number): number {
  return (v15 * rho15) / 1000;
}

/**
 * Checks if observed ρ15 is within tolerance of invoice ρ15.
 * Returns true if |ρ15 - invoiceRho15| <= tolerance.
 */
export function densityWithinTolerance(
  rho15: number,
  invoiceRho15: number,
  tolerance: number = DEFAULT_DENSITY_TOLERANCE_KG_M3,
): boolean {
  return Math.abs(rho15 - invoiceRho15) <= tolerance + 1e-9;
}

/**
 * Returns difference between ρ15 and invoice ρ15 (ρ15 - invoiceRho15).
 */
export function densityDeviation(rho15: number, invoiceRho15: number): number {
  return rho15 - invoiceRho15;
}

/**
 * Rounds a density or volume number to fixed decimal places.
 */
export function roundDensity(rho: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(rho * factor) / factor;
}
