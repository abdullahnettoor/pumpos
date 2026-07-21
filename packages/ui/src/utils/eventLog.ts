import { inr } from './format.js';

export type EventTone = 'info' | 'success' | 'warning' | 'danger' | 'default';

/** Human-readable label for each business event type (catalog in @pump/core). */
const EVENT_LABELS: Record<string, string> = {
  ORGANIZATION_CREATED: 'Organization created',
  STATION_CREATED: 'Station created',
  STATION_UPDATED: 'Station updated',
  USER_CREATED: 'Team member added',
  USER_UPDATED: 'Team member updated',
  PRODUCT_CREATED: 'Product added',
  PRODUCT_UPDATED: 'Product updated',
  PRICE_CHANGED: 'Fuel price changed',
  PAYMENT_TERMINAL_REGISTERED: 'Payment terminal added',
  PAYMENT_TERMINAL_UPDATED: 'Payment terminal updated',
  TANK_CREATED: 'Tank added',
  TANK_UPDATED: 'Tank updated',
  TANK_DELETED: 'Tank removed',
  DISPENSER_CREATED: 'Dispenser added',
  DISPENSER_UPDATED: 'Dispenser updated',
  DISPENSER_DELETED: 'Dispenser removed',
  NOZZLE_CREATED: 'Nozzle added',
  NOZZLE_UPDATED: 'Nozzle updated',
  NOZZLE_DELETED: 'Nozzle removed',
  SHIFT_TEMPLATE_CREATED: 'Shift template added',
  SHIFT_TEMPLATE_UPDATED: 'Shift template updated',
  SHIFT_TEMPLATE_DELETED: 'Shift template removed',
  ONBOARDING_COMPLETED: 'Station onboarding completed',
  BUSINESS_DAY_OPENED: 'Business day opened',
  BUSINESS_DAY_CLOSED: 'Business day closed',
  SHIFT_OPENED: 'Shift opened',
  SHIFT_CLOSED: 'Shift closed',
  SHIFT_REOPENED: 'Shift reopened',
  SHIFT_LOCKED: 'Shift locked',
  ATTENDANT_ASSIGNED: 'Attendant assigned',
  NOZZLE_READING_RECORDED: 'Nozzle reading recorded',
  CASH_DECLARED: 'Cash declared',
  HANDOVER_RECORDED: 'Handover recorded',
  DSSR_GENERATED: 'DSSR generated',
  FUEL_SALE_RECORDED: 'Fuel sale recorded',
  RETAIL_SALE_CREATED: 'Sale recorded',
  RETAIL_SALE_VOIDED: 'Sale voided',
  RETAIL_SALE_RETURNED: 'Sale returned',
  DISCOUNT_APPLIED: 'Discount applied',
  STOCK_MOVEMENT_RECORDED: 'Stock movement recorded',
  FUEL_RECEIVED: 'Fuel received',
  TANK_DIP_RECORDED: 'Tank dip recorded',
  TANK_TRANSFER_COMPLETED: 'Tank transfer completed',
  INVENTORY_ADJUSTED: 'Inventory adjusted',
  PHYSICAL_COUNT_COMPLETED: 'Stock count completed',
  VARIANCE_RECORDED: 'Variance recorded',
  SUPPLIER_CREATED: 'Supplier added',
  SUPPLIER_UPDATED: 'Supplier updated',
  PURCHASE_CREATED: 'Purchase recorded',
  PURCHASE_APPROVED: 'Purchase approved',
  GOODS_RECEIVED: 'Goods received',
  SUPPLIER_INVOICE_CREATED: 'Supplier invoice created',
  SUPPLIER_PAID: 'Supplier paid',
  SUPPLIER_OPENING_BALANCE_SET: 'Supplier opening balance set',
  CUSTOMER_CREATED: 'Customer added',
  CUSTOMER_UPDATED: 'Customer updated',
  CUSTOMER_OPENING_BALANCE_SET: 'Customer opening balance set',
  VEHICLE_ADDED: 'Vehicle added',
  VEHICLE_UPDATED: 'Vehicle updated',
  VEHICLE_REMOVED: 'Vehicle removed',
  CREDIT_LIMIT_CHANGED: 'Credit limit changed',
  CREDIT_SALE_CREATED: 'Credit sale recorded',
  CREDIT_SALE_VOIDED: 'Credit sale voided',
  CREDIT_PAYMENT_RECEIVED: 'Credit payment received',
  EXPENSE_RECORDED: 'Expense recorded',
  EXPENSE_VOIDED: 'Expense voided',
  PAYMENT_RECEIVED: 'Collection received',
  PAYMENT_MADE: 'Payment made',
};

/** Category tone for the event-type tag, keyed by a prefix/keyword. */
export function eventTone(type: string): EventTone {
  if (/VOIDED|DELETED|REMOVED|LOCKED/.test(type)) return 'danger';
  if (/VARIANCE|REOPENED/.test(type)) return 'warning';
  if (/SALE|PAYMENT_RECEIVED|CREDIT_PAYMENT|RECEIVED|CLOSED|GENERATED|COMPLETED/.test(type)) return 'success';
  if (/EXPENSE|PURCHASE|SUPPLIER_PAID|PAYMENT_MADE|PRICE/.test(type)) return 'warning';
  if (/SHIFT|BUSINESS_DAY|DSSR|HANDOVER|READING|CASH/.test(type)) return 'info';
  return 'default';
}

/** Readable label; falls back to a Title-cased version of the raw type. */
export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Short human detail derived from the event payload (amounts, variance, etc.). */
export function eventDetail(ev: { eventType: string; payload?: any }): string | undefined {
  const p = ev.payload || {};
  if (ev.eventType === 'SHIFT_CLOSED' && p.cashVariance != null) {
    return `variance ${inr(Number(p.cashVariance))}`;
  }
  if (ev.eventType === 'PRICE_CHANGED' && p.price != null) {
    return `${inr(Number(p.price))}/L`;
  }
  if (p.amount != null) return inr(Number(p.amount));
  if (p.name) return String(p.name);
  return undefined;
}
