export interface DssrSnapshot {
  id: string;
  organizationId: string;
  stationId: string;
  businessDate: string;
  snapshotData: Record<string, unknown>;
  generatedAt: string;
}

export interface DssrSnapshotRepository {
  findByStationDate(organizationId: string, stationId: string, businessDate: string): Promise<DssrSnapshot | null>;
  save(snapshot: DssrSnapshot): Promise<void>;
}

export interface DssrShiftSummary {
  shiftId: string;
  snapshot: Record<string, unknown>;
}
export interface DssrCollection {
  paymentMethod: string;
  amount: number;
}
export interface DssrExpense {
  affectsDrawer: boolean;
  paidFrom: string;
  amount: number;
  status: string;
}
export interface DssrPurchase {
  amount: number;
}
export interface DssrSupplierPayment {
  affectsDrawer: boolean;
  paidFrom: string;
  amount: number;
}
export interface DssrSale {
  paymentMethod: string;
  saleType: string;
  totalAmount: number;
}

/** Everything anchored to a single business day, used to compose the DSSR. */
export interface DssrSourceData {
  shiftSummaries: DssrShiftSummary[];
  collections: DssrCollection[];
  expenses: DssrExpense[];
  purchases: DssrPurchase[];
  supplierPayments: DssrSupplierPayment[];
  sales: DssrSale[];
}

export interface DssrDataReader {
  readBusinessDay(businessDayId: string): Promise<DssrSourceData>;
}
