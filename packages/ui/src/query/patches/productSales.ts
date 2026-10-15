/**
 * Patches for the shift's Product sales lists (#606) from a write's own answer:
 * Handover Product Sales (`queryKeys.merchandiseHandovers(shiftId)`) and Billed
 * Sales (`queryKeys.merchandiseSales(shiftId)`), both newest first as the
 * server lists them.
 *
 * The answer carries the sale and its lines (every figure); it does not carry
 * the names the list shows beside them, so the caller passes those from the
 * records the operator picked. The attendants' attribution on the shift board
 * is the server's and arrives with the refetch.
 */

/** A sale line as POST /transactions/sales and …/merchandise-handover answer it. */
export interface AnsweredSaleLine {
  saleId: string;
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
  lineTotal: string | number;
}

/** The sale as those writes answer it. */
export interface AnsweredSale {
  id: string;
  documentNumber?: string | null;
  shiftId: string;
  attendantId: string | null;
  customerId?: string | null;
  paymentMethod?: string | null;
  subtotalAmount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  nonCashAmount?: string | number | null;
  buyerDetails?: { name?: string | null } | null;
  createdAt: string;
}

export interface SaleAnswer {
  sale: AnsweredSale;
  lines: AnsweredSaleLine[];
}

/** Names the list shows that the answer does not carry. */
export interface SaleLabels {
  attendantName: string | null;
  /** Product name by id, for the lines. */
  productNames: Record<string, string>;
  /** A billed sale's saved customer; a walk-in buyer's name comes from the answer. */
  customerName?: string | null;
}

/** A Handover Product Sale row (GET …/merchandise-handovers). */
export interface HandoverProductSaleRow {
  id: string;
  attendantId: string | null;
  attendantName: string | null;
  subtotalAmount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  nonCashAmount: string | number | null;
  createdAt: string;
  items: {
    saleId: string;
    productId: string;
    productName: string | null;
    quantity: string | number;
    unitPrice: string | number;
    lineTotal: string | number;
  }[];
}

/** A Billed Sale row (GET …/merchandise-sales). */
export interface BilledSaleRow {
  id: string;
  documentNumber: string | null;
  attendantId: string | null;
  attendantName: string | null;
  customerId: string | null;
  customerName: string | null;
  buyerDetails: { name?: string | null } | null;
  paymentMethod: string | null;
  totalAmount: string | number;
  createdAt: string;
  items: {
    saleId: string;
    productName: string | null;
    quantity: string | number;
    lineTotal: string | number;
  }[];
}

const nameOf = (labels: SaleLabels, productId: string) => labels.productNames[productId] ?? null;

export function handoverProductSaleRow(
  answer: SaleAnswer,
  labels: SaleLabels,
): HandoverProductSaleRow {
  const { sale, lines } = answer;
  return {
    id: sale.id,
    attendantId: sale.attendantId,
    attendantName: labels.attendantName,
    subtotalAmount: sale.subtotalAmount,
    taxAmount: sale.taxAmount,
    totalAmount: sale.totalAmount,
    nonCashAmount: sale.nonCashAmount ?? null,
    createdAt: sale.createdAt,
    items: lines.map((l) => ({
      saleId: l.saleId,
      productId: l.productId,
      productName: nameOf(labels, l.productId),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };
}

/**
 * One Handover Product Sale per employee per shift: the answer replaces the
 * employee's previous one and, being the newest, leads the list.
 */
export function withHandoverProductSale<T extends { id: string; attendantId?: string | null }>(
  list: T[],
  row: HandoverProductSaleRow,
): (T | HandoverProductSaleRow)[] {
  const rest = list.filter(
    (r) => r.id !== row.id && !(row.attendantId && r.attendantId === row.attendantId),
  );
  return [row, ...rest];
}

/** A removed sale leaves the list (the delete answers only its id). */
export function withoutSale<T extends { id: string }>(list: T[], saleId: string): T[] {
  return list.some((r) => r.id === saleId) ? list.filter((r) => r.id !== saleId) : list;
}

export function billedSaleRow(answer: SaleAnswer, labels: SaleLabels): BilledSaleRow {
  const { sale, lines } = answer;
  const buyerDetails = sale.buyerDetails ?? null;
  return {
    id: sale.id,
    documentNumber: sale.documentNumber ?? null,
    attendantId: sale.attendantId,
    attendantName: labels.attendantName,
    customerId: sale.customerId ?? null,
    // As the list reads it: the saved customer, else the walk-in buyer.
    customerName: labels.customerName ?? buyerDetails?.name ?? null,
    buyerDetails,
    paymentMethod: sale.paymentMethod ?? null,
    totalAmount: sale.totalAmount,
    createdAt: sale.createdAt,
    items: lines.map((l) => ({
      saleId: l.saleId,
      productName: nameOf(labels, l.productId),
      quantity: l.quantity,
      lineTotal: l.lineTotal,
    })),
  };
}

/** A new Billed Sale leads the list; a replayed answer is not listed twice. */
export function withBilledSale<T extends { id: string }>(
  list: T[],
  row: BilledSaleRow,
): (T | BilledSaleRow)[] {
  return list.some((r) => r.id === row.id) ? list : [row, ...list];
}
