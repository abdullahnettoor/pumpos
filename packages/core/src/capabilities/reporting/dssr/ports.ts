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
  templateName?: string | null;
  closedAt?: string | null;
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

/** Merchandise sale line item, for COGS = Σ qty × product cost basis. */
export interface DssrSaleItem {
  productId: string;
  quantity: number;
}

/** Customer-ledger credit sale (receivable) created during the business day. */
export interface DssrCreditSale {
  customerType: string;
  amount: number;
}

/** Business-day tank dip / physical-count reconciliation. */
export interface DssrStockVariance {
  tankName: string;
  productName: string;
  /** Measurement unit of the product (e.g. 'Litre', 'Piece'). */
  unit: string;
  /** 'BULK' (fuel tanks, volume) | 'ITEM' (packaged merchandise, count) | 'NONE'. */
  inventoryType: string;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  reason: string | null;
}

/** Everything anchored to a single business day, used to compose the DSSR. */
export interface DssrSourceData {
  shiftSummaries: DssrShiftSummary[];
  collections: DssrCollection[];
  expenses: DssrExpense[];
  purchases: DssrPurchase[];
  supplierPayments: DssrSupplierPayment[];
  sales: DssrSale[];
  creditSales: DssrCreditSale[];
  stockVariances: DssrStockVariance[];
  /** Merchandise sale line items (productId + qty) for merchandise COGS. */
  saleItems: DssrSaleItem[];
  /** productId → { name, code, costBasis } for fuel roll-up + COGS. */
  products: Record<string, { name: string; code: string; unit: string; costBasis: number }>;
  /** nozzleId → nozzle name. */
  nozzles: Record<string, string>;
}

export interface DssrDataReader {
  readBusinessDay(businessDayId: string): Promise<DssrSourceData>;
}
