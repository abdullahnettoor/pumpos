import type { Letterhead } from '../../letterhead.js';

/*
 * The one fictional station every proposal prints: a Kerala IndianOil retail
 * outlet with three DUs, six nozzles, five attendants and a small lube shelf.
 * Figures are generated from a seeded PRNG so every render is identical.
 */

export const STATION_NAME = 'Sree Lakshmi Fuels';
export const LETTERHEAD: Letterhead = {
  legalName: 'Sree Lakshmi Fuels',
  gstin: '32AAKFS4821M1Z7',
  stateCode: '32',
  roCode: 'RO 241907',
  fuelBrand: 'IndianOil',
  addressLine: 'NH 66, Edappally, Kochi',
  pincode: '682024',
  contact: '+91 94470 21530',
};
export const GENERATED = '02 Nov 2026, 10:00 am';
export const PERIOD = 'Oct 2026 (01–31 Oct)';
export const PREV_PERIOD = 'Sep 2026';

/** `2026-10-01` … `2026-10-31`. */
export const OCT_DAYS: string[] = Array.from(
  { length: 31 },
  (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`,
);

/** Deterministic PRNG (mulberry32): same seed, same sample. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Uniform in [min, max). */
    between: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  };
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type ProductKind = 'Fuel' | 'Product';

export interface SampleProduct {
  code: string;
  name: string;
  kind: ProductKind;
  /** Group-B pick-list value. */
  category: string;
  unit: 'L' | 'Nos';
  /** Selling rate (fuel: per litre, VAT inclusive; products: MRP, GST inclusive). */
  rate: number;
  /** Cost price per unit (fuel: dealer purchase price incl. VAT). */
  cost: number;
  hsn: string;
  /** GST % for products; VAT % (Kerala) for fuel. */
  taxRate: number;
  reorderLevel?: number;
}

export const FUELS: SampleProduct[] = [
  {
    code: 'MS',
    name: 'Petrol',
    kind: 'Fuel',
    category: 'Fuel',
    unit: 'L',
    rate: 107.48,
    cost: 103.31,
    hsn: '27101241',
    taxRate: 30.08,
  },
  {
    code: 'HSD',
    name: 'Diesel',
    kind: 'Fuel',
    category: 'Fuel',
    unit: 'L',
    rate: 96.48,
    cost: 93.86,
    hsn: '27101943',
    taxRate: 22.76,
  },
  {
    code: 'XP95',
    name: 'XP95 (Power)',
    kind: 'Fuel',
    category: 'Fuel',
    unit: 'L',
    rate: 114.2,
    cost: 109.62,
    hsn: '27101241',
    taxRate: 30.08,
  },
];

export const LUBES: SampleProduct[] = [
  {
    code: 'SV4T-1',
    name: 'Servo 4T Xtra 20W-40 1 L',
    kind: 'Product',
    category: 'Engine oil',
    unit: 'Nos',
    rate: 420,
    cost: 352,
    hsn: '27101981',
    taxRate: 18,
    reorderLevel: 24,
  },
  {
    code: 'SVPR-35',
    name: 'Servo Pride 15W-40 3.5 L',
    kind: 'Product',
    category: 'Engine oil',
    unit: 'Nos',
    rate: 1290,
    cost: 1084,
    hsn: '27101981',
    taxRate: 18,
    reorderLevel: 10,
  },
  {
    code: 'SVF-5W30',
    name: 'Servo Futura 5W-30 3 L',
    kind: 'Product',
    category: 'Engine oil',
    unit: 'Nos',
    rate: 1980,
    cost: 1662,
    hsn: '27101981',
    taxRate: 18,
    reorderLevel: 6,
  },
  {
    code: 'CLT-1',
    name: 'Servo Coolant Plus 1 L',
    kind: 'Product',
    category: 'Coolant',
    unit: 'Nos',
    rate: 260,
    cost: 212,
    hsn: '38200000',
    taxRate: 18,
    reorderLevel: 12,
  },
  {
    code: 'GRS-500',
    name: 'Servo MP Grease 500 g',
    kind: 'Product',
    category: 'Grease',
    unit: 'Nos',
    rate: 185,
    cost: 149,
    hsn: '27101990',
    taxRate: 18,
    reorderLevel: 10,
  },
  {
    code: 'DW-1',
    name: 'Distilled water 1 L',
    kind: 'Product',
    category: 'Accessories',
    unit: 'Nos',
    rate: 30,
    cost: 18,
    hsn: '28510010',
    taxRate: 18,
    reorderLevel: 30,
  },
  {
    code: 'WIPER',
    name: 'Wiper blade 18"',
    kind: 'Product',
    category: 'Accessories',
    unit: 'Nos',
    rate: 350,
    cost: 255,
    hsn: '85129000',
    taxRate: 18,
    reorderLevel: 5,
  },
];

export const ALL_PRODUCTS = [...FUELS, ...LUBES];

export const ATTENDANTS = ['Rahul K', 'Anil Kumar', 'Suresh P', 'Faisal M', 'Vinod T'];

export interface SampleNozzle {
  code: string;
  du: string;
  fuel: SampleProduct;
  tank: string;
}
export const NOZZLES: SampleNozzle[] = [
  { code: 'N1', du: 'DU-1', fuel: FUELS[0], tank: 'T1' },
  { code: 'N2', du: 'DU-1', fuel: FUELS[1], tank: 'T2' },
  { code: 'N3', du: 'DU-2', fuel: FUELS[0], tank: 'T1' },
  { code: 'N4', du: 'DU-2', fuel: FUELS[1], tank: 'T2' },
  { code: 'N5', du: 'DU-3', fuel: FUELS[2], tank: 'T3' },
  { code: 'N6', du: 'DU-3', fuel: FUELS[1], tank: 'T2' },
];

export const TANKS = [
  { code: 'T1', fuel: FUELS[0], capacity: 20000 },
  { code: 'T2', fuel: FUELS[1], capacity: 20000 },
  { code: 'T3', fuel: FUELS[2], capacity: 9000 },
];

export const CUSTOMERS = [
  {
    name: 'Kochi Metro Logistics',
    phone: '98470 11234',
    limit: 300000,
    type: 'Fleet',
    gstin: '32AAHCK7781P1Z2',
  },
  {
    name: 'Periyar Travels',
    phone: '94460 55120',
    limit: 150000,
    type: 'Fleet',
    gstin: '32ABEPT2210Q1Z9',
  },
  {
    name: 'St. Mary’s School (bus)',
    phone: '0484 2558812',
    limit: 120000,
    type: 'Credit',
    gstin: '',
  },
  {
    name: 'Malabar Constructions',
    phone: '98950 77410',
    limit: 200000,
    type: 'Credit',
    gstin: '32AAGFM5531R1ZK',
  },
  { name: 'City Taxi Union', phone: '97440 21987', limit: 60000, type: 'Credit', gstin: '' },
  { name: 'Green Valley Farms', phone: '94950 33018', limit: 50000, type: 'Credit', gstin: '' },
  { name: 'Joseph Mathew', phone: '98460 40922', limit: 25000, type: 'Credit', gstin: '' },
];

export const SUPPLIERS = [
  { name: 'Indian Oil Corporation Ltd', gstin: '32AAACI1681G1ZT' },
  { name: 'Servo Lubes Distributors', gstin: '32AAVFS9012D1Z4' },
  { name: 'Kerala Auto Accessories', gstin: '32ABQPK4410J1ZD' },
];

export const SHIFTS = ['Morning', 'Evening'];
/** Shift label: `YYYYMMDD-N`. */
export const shiftLabel = (iso: string, n: number) => `${iso.replace(/-/g, '')}-${n}`;
