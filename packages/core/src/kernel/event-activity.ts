import type { DomainEvent } from './event.js';
import { BusinessEvents, type BusinessEventType } from './event-catalog.js';

export type EventTone = 'info' | 'success' | 'warning' | 'danger' | 'default';
export type EventValueFormat =
  'text' | 'integer' | 'decimal' | 'inr' | 'date' | 'volume-litres' | 'quantity' | 'percentage';
export type EventGroupingRole = 'primary' | 'related';
export type EventActorKind = 'tenant_user' | 'platform_admin' | 'system';
export type ActivityValue = string | number | boolean;

export interface EventGroupingMetadata {
  role: EventGroupingRole;
}

export interface EventActorSnapshot {
  kind: EventActorKind;
  displayName: string;
  role: string | null;
  subjectId?: string | null;
}

export interface EventPresentationInput {
  templateId: string;
  values: Record<string, ActivityValue>;
}

export interface DomainEventMetadata {
  grouping?: EventGroupingMetadata;
  presentation?: EventPresentationInput;
  actorSnapshot?: EventActorSnapshot;
  [key: string]: unknown;
}

export interface EventActivityTemplateDefinition {
  id: string;
  template: string;
  formats: Record<string, EventValueFormat>;
}

export interface EventActivityDefinition {
  eventType: BusinessEventType;
  defaultTitle: string;
  defaultTone: EventTone;
  /** Stable generic copy for legacy events and emitters without presentation values. */
  fallbackDescription: string;
  templates: readonly EventActivityTemplateDefinition[];
}

export interface RenderedEventActivity {
  title: string;
  description: string;
  tone: EventTone;
  renderStatus: 'rendered' | 'fallback';
  diagnostic?: 'unknown-event-type' | 'unknown-template' | 'missing-value' | 'invalid-value';
}

const template = (
  id: string,
  text: string,
  formats: Record<string, EventValueFormat>,
): EventActivityTemplateDefinition => ({ id, template: text, formats });

const definition = (
  eventType: BusinessEventType,
  defaultTitle: string,
  defaultTone: EventTone = 'default',
  templates: readonly EventActivityTemplateDefinition[] = [],
): EventActivityDefinition => ({
  eventType,
  defaultTitle,
  defaultTone,
  fallbackDescription: defaultTitle,
  templates,
});

const success = (
  eventType: BusinessEventType,
  title: string,
  templates?: readonly EventActivityTemplateDefinition[],
) => definition(eventType, title, 'success', templates);
const info = (
  eventType: BusinessEventType,
  title: string,
  templates?: readonly EventActivityTemplateDefinition[],
) => definition(eventType, title, 'info', templates);
const warning = (
  eventType: BusinessEventType,
  title: string,
  templates?: readonly EventActivityTemplateDefinition[],
) => definition(eventType, title, 'warning', templates);
const danger = (
  eventType: BusinessEventType,
  title: string,
  templates?: readonly EventActivityTemplateDefinition[],
) => definition(eventType, title, 'danger', templates);

/**
 * Presentation stays independent of event identity. Definitions without a
 * template intentionally render their stable generic fallback until the
 * emitter captures the immutable display values required by richer copy.
 */
export const EventActivityCatalog = {
  [BusinessEvents.ORGANIZATION_CREATED]: success(
    BusinessEvents.ORGANIZATION_CREATED,
    'Organization created',
  ),
  [BusinessEvents.ORGANIZATION_DEACTIVATED]: danger(
    BusinessEvents.ORGANIZATION_DEACTIVATED,
    'Organization deactivated',
  ),
  [BusinessEvents.ORGANIZATION_REACTIVATED]: success(
    BusinessEvents.ORGANIZATION_REACTIVATED,
    'Organization reactivated',
  ),
  [BusinessEvents.OWNER_INVITE_RESENT]: info(
    BusinessEvents.OWNER_INVITE_RESENT,
    'Owner invitation resent',
  ),
  [BusinessEvents.OWNER_INVITE_REVOKED]: danger(
    BusinessEvents.OWNER_INVITE_REVOKED,
    'Owner invitation revoked',
  ),
  [BusinessEvents.STATION_CREATED]: success(BusinessEvents.STATION_CREATED, 'Station added'),
  [BusinessEvents.STATION_UPDATED]: info(BusinessEvents.STATION_UPDATED, 'Station updated'),
  [BusinessEvents.USER_CREATED]: success(BusinessEvents.USER_CREATED, 'Team member added'),
  [BusinessEvents.USER_INVITED]: info(BusinessEvents.USER_INVITED, 'Team member invited'),
  [BusinessEvents.USER_PASSWORD_RESET]: info(
    BusinessEvents.USER_PASSWORD_RESET,
    'Password reset sent',
  ),
  [BusinessEvents.USER_DEACTIVATED]: danger(
    BusinessEvents.USER_DEACTIVATED,
    'Team member deactivated',
  ),
  [BusinessEvents.USER_REACTIVATED]: success(
    BusinessEvents.USER_REACTIVATED,
    'Team member reactivated',
  ),
  [BusinessEvents.USER_UPDATED]: info(BusinessEvents.USER_UPDATED, 'Team member updated'),
  [BusinessEvents.PRODUCT_CREATED]: success(BusinessEvents.PRODUCT_CREATED, 'Product added'),
  [BusinessEvents.PRODUCT_UPDATED]: info(BusinessEvents.PRODUCT_UPDATED, 'Product updated'),
  [BusinessEvents.PRICE_CHANGED]: warning(BusinessEvents.PRICE_CHANGED, 'Price changed'),
  [BusinessEvents.PAYMENT_TERMINAL_REGISTERED]: success(
    BusinessEvents.PAYMENT_TERMINAL_REGISTERED,
    'Payment terminal added',
  ),
  [BusinessEvents.PAYMENT_TERMINAL_UPDATED]: info(
    BusinessEvents.PAYMENT_TERMINAL_UPDATED,
    'Payment terminal updated',
  ),
  [BusinessEvents.TANK_CREATED]: success(BusinessEvents.TANK_CREATED, 'Tank added'),
  [BusinessEvents.TANK_UPDATED]: info(BusinessEvents.TANK_UPDATED, 'Tank updated'),
  [BusinessEvents.TANK_DELETED]: danger(BusinessEvents.TANK_DELETED, 'Tank removed'),
  [BusinessEvents.DISPENSER_CREATED]: success(BusinessEvents.DISPENSER_CREATED, 'Dispenser added'),
  [BusinessEvents.DISPENSER_UPDATED]: info(BusinessEvents.DISPENSER_UPDATED, 'Dispenser updated'),
  [BusinessEvents.DISPENSER_DELETED]: danger(BusinessEvents.DISPENSER_DELETED, 'Dispenser removed'),
  [BusinessEvents.NOZZLE_CREATED]: success(BusinessEvents.NOZZLE_CREATED, 'Nozzle added'),
  [BusinessEvents.NOZZLE_UPDATED]: info(BusinessEvents.NOZZLE_UPDATED, 'Nozzle updated'),
  [BusinessEvents.NOZZLE_DELETED]: danger(BusinessEvents.NOZZLE_DELETED, 'Nozzle removed'),
  [BusinessEvents.SHIFT_TEMPLATE_CREATED]: success(
    BusinessEvents.SHIFT_TEMPLATE_CREATED,
    'Shift template added',
  ),
  [BusinessEvents.SHIFT_TEMPLATE_UPDATED]: info(
    BusinessEvents.SHIFT_TEMPLATE_UPDATED,
    'Shift template updated',
  ),
  [BusinessEvents.SHIFT_TEMPLATE_DELETED]: danger(
    BusinessEvents.SHIFT_TEMPLATE_DELETED,
    'Shift template removed',
  ),
  [BusinessEvents.ONBOARDING_COMPLETED]: success(
    BusinessEvents.ONBOARDING_COMPLETED,
    'Station onboarding completed',
  ),
  [BusinessEvents.BUSINESS_DAY_OPENED]: success(
    BusinessEvents.BUSINESS_DAY_OPENED,
    'Business day opened',
  ),
  [BusinessEvents.BUSINESS_DAY_CLOSED]: success(
    BusinessEvents.BUSINESS_DAY_CLOSED,
    'Business day closed',
  ),
  [BusinessEvents.SHIFT_OPENED]: success(BusinessEvents.SHIFT_OPENED, 'Shift opened', [
    template('shift-opened.v1', 'Opened a shift with {openingCash}.', { openingCash: 'inr' }),
  ]),
  [BusinessEvents.SHIFT_CLOSED]: success(BusinessEvents.SHIFT_CLOSED, 'Shift closed', [
    template('shift-closed.v1', 'Closed a shift with a cash variance of {cashVariance}.', {
      cashVariance: 'inr',
    }),
  ]),
  [BusinessEvents.SHIFT_REOPENED]: warning(BusinessEvents.SHIFT_REOPENED, 'Shift reopened'),
  [BusinessEvents.SHIFT_LOCKED]: danger(BusinessEvents.SHIFT_LOCKED, 'Shift locked'),
  [BusinessEvents.ATTENDANT_ASSIGNED]: info(
    BusinessEvents.ATTENDANT_ASSIGNED,
    'Attendant assigned',
  ),
  [BusinessEvents.NOZZLE_READING_RECORDED]: info(
    BusinessEvents.NOZZLE_READING_RECORDED,
    'Nozzle readings recorded',
  ),
  [BusinessEvents.CASH_DECLARED]: info(BusinessEvents.CASH_DECLARED, 'Cash declared', [
    template('cash-declared.v1', 'Declared {closingCash} cash.', { closingCash: 'inr' }),
  ]),
  [BusinessEvents.HANDOVER_RECORDED]: info(BusinessEvents.HANDOVER_RECORDED, 'Handover recorded', [
    template('handover-recorded.v1', "Recorded {attendantName}'s handover for {duName}.", {
      attendantName: 'text',
      duName: 'text',
    }),
  ]),
  [BusinessEvents.DSSR_GENERATED]: success(BusinessEvents.DSSR_GENERATED, 'DSSR generated'),
  [BusinessEvents.FUEL_SALE_RECORDED]: success(
    BusinessEvents.FUEL_SALE_RECORDED,
    'Fuel sale recorded',
  ),
  [BusinessEvents.RETAIL_SALE_CREATED]: success(
    BusinessEvents.RETAIL_SALE_CREATED,
    'Sale recorded',
    [
      template('retail-sale.amount.v1', 'Recorded a sale for {amount} via {paymentMethod}.', {
        amount: 'inr',
        paymentMethod: 'text',
      }),
    ],
  ),
  [BusinessEvents.RETAIL_SALE_VOIDED]: danger(BusinessEvents.RETAIL_SALE_VOIDED, 'Sale voided'),
  [BusinessEvents.RETAIL_SALE_RETURNED]: danger(
    BusinessEvents.RETAIL_SALE_RETURNED,
    'Sale returned',
  ),
  [BusinessEvents.DISCOUNT_APPLIED]: warning(BusinessEvents.DISCOUNT_APPLIED, 'Discount applied'),
  [BusinessEvents.STOCK_MOVEMENT_RECORDED]: info(
    BusinessEvents.STOCK_MOVEMENT_RECORDED,
    'Stock movement recorded',
  ),
  [BusinessEvents.FUEL_RECEIVED]: success(BusinessEvents.FUEL_RECEIVED, 'Fuel received'),
  [BusinessEvents.TANK_DIP_RECORDED]: info(BusinessEvents.TANK_DIP_RECORDED, 'Tank dip recorded'),
  [BusinessEvents.TANK_TRANSFER_COMPLETED]: success(
    BusinessEvents.TANK_TRANSFER_COMPLETED,
    'Tank transfer completed',
  ),
  [BusinessEvents.INVENTORY_ADJUSTED]: warning(
    BusinessEvents.INVENTORY_ADJUSTED,
    'Inventory adjusted',
  ),
  [BusinessEvents.PHYSICAL_COUNT_COMPLETED]: success(
    BusinessEvents.PHYSICAL_COUNT_COMPLETED,
    'Physical count completed',
  ),
  [BusinessEvents.VARIANCE_RECORDED]: warning(
    BusinessEvents.VARIANCE_RECORDED,
    'Variance recorded',
  ),
  [BusinessEvents.SUPPLIER_CREATED]: success(BusinessEvents.SUPPLIER_CREATED, 'Supplier added'),
  [BusinessEvents.SUPPLIER_UPDATED]: info(BusinessEvents.SUPPLIER_UPDATED, 'Supplier updated'),
  [BusinessEvents.PURCHASE_CREATED]: success(BusinessEvents.PURCHASE_CREATED, 'Purchase recorded', [
    template(
      'purchase.v1',
      'Recorded a purchase from {supplierName}: {lineCount} items for {amount}.',
      {
        supplierName: 'text',
        lineCount: 'integer',
        amount: 'inr',
      },
    ),
  ]),
  [BusinessEvents.PURCHASE_APPROVED]: success(
    BusinessEvents.PURCHASE_APPROVED,
    'Purchase approved',
  ),
  [BusinessEvents.GOODS_RECEIVED]: success(BusinessEvents.GOODS_RECEIVED, 'Goods received', [
    template(
      'goods-received.v1',
      'Received {quantity} {unit} of {productName} from {supplierName}.',
      {
        quantity: 'quantity',
        unit: 'text',
        productName: 'text',
        supplierName: 'text',
      },
    ),
  ]),
  [BusinessEvents.SUPPLIER_INVOICE_CREATED]: success(
    BusinessEvents.SUPPLIER_INVOICE_CREATED,
    'Supplier invoice recorded',
    [
      template(
        'supplier-invoice.v1',
        'Recorded invoice {invoiceNumber} from {supplierName} for {amount}.',
        {
          invoiceNumber: 'text',
          supplierName: 'text',
          amount: 'inr',
        },
      ),
    ],
  ),
  [BusinessEvents.SUPPLIER_PAID]: success(BusinessEvents.SUPPLIER_PAID, 'Supplier paid', [
    template('supplier-paid.v1', 'Paid {supplierName} {amount} from {accountName}.', {
      supplierName: 'text',
      amount: 'inr',
      accountName: 'text',
    }),
  ]),
  [BusinessEvents.SUPPLIER_OPENING_BALANCE_SET]: info(
    BusinessEvents.SUPPLIER_OPENING_BALANCE_SET,
    'Supplier opening balance set',
  ),
  [BusinessEvents.CUSTOMER_CREATED]: success(BusinessEvents.CUSTOMER_CREATED, 'Customer added'),
  [BusinessEvents.CUSTOMER_UPDATED]: info(BusinessEvents.CUSTOMER_UPDATED, 'Customer updated'),
  [BusinessEvents.CUSTOMER_OPENING_BALANCE_SET]: info(
    BusinessEvents.CUSTOMER_OPENING_BALANCE_SET,
    'Customer opening balance set',
  ),
  [BusinessEvents.VEHICLE_ADDED]: success(BusinessEvents.VEHICLE_ADDED, 'Vehicle added'),
  [BusinessEvents.VEHICLE_UPDATED]: info(BusinessEvents.VEHICLE_UPDATED, 'Vehicle updated'),
  [BusinessEvents.VEHICLE_REMOVED]: danger(BusinessEvents.VEHICLE_REMOVED, 'Vehicle removed'),
  [BusinessEvents.CREDIT_LIMIT_CHANGED]: warning(
    BusinessEvents.CREDIT_LIMIT_CHANGED,
    'Credit limit changed',
  ),
  [BusinessEvents.CREDIT_SALE_CREATED]: success(
    BusinessEvents.CREDIT_SALE_CREATED,
    'Credit sale recorded',
    [
      template(
        'credit-sale.product.v1',
        'Recorded a credit sale to {customerName}: {itemSummary} for {amount}.',
        {
          customerName: 'text',
          itemSummary: 'text',
          amount: 'inr',
        },
      ),
      template(
        'credit-sale.amount-only.v1',
        'Recorded a credit sale to {customerName} for {amount}.',
        {
          customerName: 'text',
          amount: 'inr',
        },
      ),
    ],
  ),
  [BusinessEvents.CREDIT_SALE_VOIDED]: danger(
    BusinessEvents.CREDIT_SALE_VOIDED,
    'Credit sale voided',
  ),
  [BusinessEvents.CREDIT_PAYMENT_RECEIVED]: success(
    BusinessEvents.CREDIT_PAYMENT_RECEIVED,
    'Credit payment received',
    [
      template(
        'credit-payment-received.v1',
        'Received {amount} from {customerName} via {paymentMethod}.',
        {
          amount: 'inr',
          customerName: 'text',
          paymentMethod: 'text',
        },
      ),
    ],
  ),
  [BusinessEvents.OMC_CARD_SALE_CREATED]: success(
    BusinessEvents.OMC_CARD_SALE_CREATED,
    'OMC card sale recorded',
  ),
  [BusinessEvents.OMC_CARD_SALE_VOIDED]: danger(
    BusinessEvents.OMC_CARD_SALE_VOIDED,
    'OMC card sale voided',
  ),
  [BusinessEvents.EXPENSE_RECORDED]: warning(BusinessEvents.EXPENSE_RECORDED, 'Expense recorded', [
    template('expense.v1', 'Recorded an expense of {amount} from {accountName}.', {
      amount: 'inr',
      accountName: 'text',
    }),
  ]),
  [BusinessEvents.EXPENSE_VOIDED]: danger(BusinessEvents.EXPENSE_VOIDED, 'Expense voided'),
  [BusinessEvents.INCOME_RECORDED]: success(BusinessEvents.INCOME_RECORDED, 'Income recorded'),
  [BusinessEvents.INCOME_VOIDED]: danger(BusinessEvents.INCOME_VOIDED, 'Income voided'),
  [BusinessEvents.PAYMENT_RECEIVED]: success(BusinessEvents.PAYMENT_RECEIVED, 'Payment received'),
  [BusinessEvents.PAYMENT_MADE]: warning(BusinessEvents.PAYMENT_MADE, 'Payment made', [
    template('payment-made.v1', 'Paid {amount} to {partyName} from {accountName}.', {
      amount: 'inr',
      partyName: 'text',
      accountName: 'text',
    }),
  ]),
  [BusinessEvents.INVOICE_GENERATED]: success(
    BusinessEvents.INVOICE_GENERATED,
    'Invoice generated',
  ),
  [BusinessEvents.FINANCIAL_ACCOUNT_CREATED]: success(
    BusinessEvents.FINANCIAL_ACCOUNT_CREATED,
    'Financial account added',
  ),
  [BusinessEvents.FINANCIAL_ACCOUNT_UPDATED]: info(
    BusinessEvents.FINANCIAL_ACCOUNT_UPDATED,
    'Financial account updated',
  ),
  [BusinessEvents.LEDGER_ENTRY_POSTED]: info(
    BusinessEvents.LEDGER_ENTRY_POSTED,
    'Ledger entry posted',
  ),
} satisfies Record<BusinessEventType, EventActivityDefinition>;

function isPresentation(value: unknown): value is EventPresentationInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { templateId?: unknown; values?: unknown };
  return (
    typeof candidate.templateId === 'string' &&
    Boolean(candidate.values) &&
    typeof candidate.values === 'object' &&
    !Array.isArray(candidate.values)
  );
}

function titleForUnknown(eventType: string): string {
  return eventType
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\w/g, (character) => character.toUpperCase());
}

function formatValue(value: ActivityValue, format: EventValueFormat): string | null {
  if (format === 'text')
    return (
      String(value)
        // Deliberate: activity text is rendered in a UI and in PDFs, so control
        // characters from upstream payloads are stripped rather than escaped.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .trim() || null
    );
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  switch (format) {
    case 'integer':
      return Number.isInteger(numeric)
        ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(numeric)
        : null;
    case 'decimal':
    case 'quantity':
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(numeric);
    case 'inr':
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(numeric);
    case 'date': {
      const date = new Date(String(value));
      return Number.isNaN(date.valueOf())
        ? null
        : new Intl.DateTimeFormat('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }).format(date);
    }
    case 'volume-litres':
      return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(numeric)} L`;
    case 'percentage':
      return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(numeric)}%`;
    default:
      return null;
  }
}

function fallback(
  eventType: string,
  definition?: EventActivityDefinition,
  diagnostic?: RenderedEventActivity['diagnostic'],
): RenderedEventActivity {
  const title = definition?.defaultTitle ?? titleForUnknown(eventType);
  return {
    title,
    description: definition?.fallbackDescription ?? title,
    tone: definition?.defaultTone ?? 'default',
    renderStatus: 'fallback',
    diagnostic,
  };
}

export function getEventActivityDefinition(eventType: string): EventActivityDefinition | undefined {
  return EventActivityCatalog[eventType as BusinessEventType];
}

/** Render registered activity templates only; malformed metadata never throws into a business write. */
export function renderEventActivity(
  event: Pick<DomainEvent, 'eventType' | 'metadata'>,
): RenderedEventActivity {
  const definition = getEventActivityDefinition(event.eventType);
  if (!definition) return fallback(event.eventType, undefined, 'unknown-event-type');
  const metadata = event.metadata as DomainEventMetadata;
  if (!isPresentation(metadata.presentation)) return fallback(event.eventType, definition);
  const selected = definition.templates.find(
    (candidate) => candidate.id === metadata.presentation!.templateId,
  );
  if (!selected) return fallback(event.eventType, definition, 'unknown-template');

  let invalidValue = false;
  const description = selected.template.replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}/g,
    (match, key: string) => {
      const value = metadata.presentation!.values[key];
      const formatted =
        value === undefined || value === null ? null : formatValue(value, selected.formats[key]);
      if (formatted === null) {
        invalidValue = true;
        return match;
      }
      return formatted;
    },
  );
  if (invalidValue || /\{[A-Za-z][A-Za-z0-9]*\}/.test(description)) {
    return fallback(event.eventType, definition, invalidValue ? 'invalid-value' : 'missing-value');
  }
  return {
    title: definition.defaultTitle,
    description,
    tone: definition.defaultTone,
    renderStatus: 'rendered',
  };
}
