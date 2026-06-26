export type SaleType = 'Fuel' | 'Product' | 'Mixed';
export type SaleCaptureMechanism = 'POS' | 'READING';
export type SalePaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Credit';

export interface SaleLine {
  id: string;
  saleId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  documentNumber: string;
  shiftId: string;
  businessDayId: string;
  saleType: SaleType;
  captureMechanism: SaleCaptureMechanism;
  paymentMethod: SalePaymentMethod;
  customerId: string | null;
  vehicleId: string | null;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleRepository {
  save(sale: Sale, lines: SaleLine[]): Promise<void>;
}
