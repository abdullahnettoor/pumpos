export type DensityReadingKind = 'MORNING' | 'ADHOC' | 'DECANTATION';
export type DensitySampledFrom = 'NOZZLE' | 'TANK';
export type DensityEntryMethod = 'HYDROMETER' | 'DIRECT_15';

export interface DensityReading {
  id: string;
  organizationId: string;
  stationId: string;
  businessDate: string;
  productId: string;
  kind: DensityReadingKind;
  sampledFrom?: DensitySampledFrom | null;
  tankId?: string | null;
  nozzleId?: string | null;
  entryMethod: DensityEntryMethod;
  observedDensity: number | null;
  observedTempC: number | null;
  density15: number;
  decantationTankLineId?: string | null;
  flags: unknown[];
  recordedBy?: string | null;
  recordedAt: string;
  createdAt?: string;
}

export interface DensityReadingWithContext extends DensityReading {
  productName?: string;
  productCode?: string;
  tankName?: string | null;
  nozzleName?: string | null;
  recordedByName?: string | null;
  delta?: number | null;
}

export interface DensityReadingListQuery {
  organizationId: string;
  stationId: string;
  productId?: string;
  from?: string;
  to?: string;
  kind?: DensityReadingKind;
  limit?: number;
}

export interface DensityTrendPoint {
  date: string;
  density15: number | null;
}

export interface DensityTodayProductSummary {
  productId: string;
  productName: string;
  productCode: string;
  latestToday: DensityReadingWithContext | null;
  todayRecorded: boolean;
  trend14d: DensityTrendPoint[];
  /** Non-null 15 °C values of `trend14d`, oldest first. */
  trendValues: number[];
  lastReadings: DensityReadingWithContext[];
}

export interface DensityTodaySummary {
  businessDate: string;
  products: DensityTodayProductSummary[];
  recordedCount: number;
  missingCount: number;
  missingProducts: Array<{ productId: string; productName: string; productCode: string }>;
  totalProducts: number;
}

export interface RecordDensityReadingPayload {
  stationId: string;
  productId: string;
  businessDate?: string;
  kind: 'MORNING' | 'ADHOC';
  sampledFrom?: DensitySampledFrom | null;
  tankId?: string | null;
  nozzleId?: string | null;
  entryMethod: DensityEntryMethod;
  observedDensity?: number;
  observedTempC?: number;
  density15?: number;
  recordedAt?: string;
}
