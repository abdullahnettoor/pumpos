import React from 'react';
import { Drawer } from '../Drawer.js';
import { ExpenseEntryForm } from '../transactions/ExpenseEntryForm.js';
import { CollectionEntryForm } from '../transactions/CollectionEntryForm.js';
import { PurchaseEntryForm } from '../transactions/PurchaseEntryForm.js';
import { MerchandiseSaleEntryForm } from '../transactions/MerchandiseSaleEntryForm.js';
import type {
  ExpenseEntryFormValues,
  CollectionEntryFormValues,
  PurchaseEntryFormValues,
  MerchandiseSaleEntryFormValues,
} from '@pump/shared';

type QuickEntryType = 'expense' | 'collection' | 'purchase' | 'merchandise-sale';

interface QuickEntryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  quickEntryType: QuickEntryType | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;

  shiftOptions: { id: string; label: string }[];
  targetShiftId: string;
  activeShiftTemplateName?: string;

  // Shared data sources
  categories: any[];
  customers: any[];
  suppliers: any[];
  products: any[];
  tanks: any[];
  attendants?: { userId: string; userName: string }[];
  stockByProduct?: Record<string, number>;

  // Per-form default values
  expenseDefaults: Partial<ExpenseEntryFormValues>;
  collectionDefaults: Partial<CollectionEntryFormValues>;
  purchaseDefaults: Partial<PurchaseEntryFormValues>;
  merchandiseDefaults: Partial<MerchandiseSaleEntryFormValues>;

  // Validated submit handlers
  onExpenseSubmit: (values: ExpenseEntryFormValues) => void | Promise<void>;
  onCollectionSubmit: (values: CollectionEntryFormValues) => void | Promise<void>;
  onPurchaseSubmit: (values: PurchaseEntryFormValues) => void | Promise<void>;
  onMerchandiseSaleSubmit: (values: MerchandiseSaleEntryFormValues) => void | Promise<void>;
}

/**
 * Slide-in quick-entry drawer for the active shift, hosting the expense /
 * collection / purchase / merchandise-sale entry forms. Each form is
 * self-contained (react-hook-form + a shared Zod schema); this drawer supplies
 * the data sources, per-form default values, and validated submit handlers.
 */
export const QuickEntryDrawer: React.FC<QuickEntryDrawerProps> = (props) => {
  const {
    isOpen, onClose, quickEntryType, loading, submitting, error,
    shiftOptions, targetShiftId, activeShiftTemplateName,
  } = props;

  const title = (() => {
    const action =
      quickEntryType === 'expense'
        ? 'Add Expense'
        : quickEntryType === 'collection'
        ? 'Log Collection'
        : quickEntryType === 'merchandise-sale'
        ? 'Merchandise Sale'
        : 'Add Purchase';
    const shiftLabel =
      shiftOptions.find((o) => o.id === targetShiftId)?.label || activeShiftTemplateName;
    return shiftLabel ? `${shiftLabel} · ${action}` : action;
  })();

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title}>
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading quick-entry form...</div>
      ) : !targetShiftId ? (
        <div style={{
          backgroundColor: 'var(--state-warning-bg)',
          color: 'var(--state-warning-fg)',
          padding: '14px',
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-soft)',
          fontSize: '13px'
        }}>
          A shift is required to record transactions. Open a shift first and try again.
        </div>
      ) : (
        <>
          {quickEntryType === 'expense' && (
            <ExpenseEntryForm
              shiftOptions={shiftOptions}
              categories={props.categories}
              defaultValues={props.expenseDefaults}
              submitting={submitting}
              error={error}
              onCancel={onClose}
              onSubmit={props.onExpenseSubmit}
              submitLabel="Add Expense"
            />
          )}

          {quickEntryType === 'collection' && (
            <CollectionEntryForm
              shiftOptions={shiftOptions}
              customers={props.customers}
              defaultValues={props.collectionDefaults}
              submitting={submitting}
              error={error}
              onCancel={onClose}
              onSubmit={props.onCollectionSubmit}
              submitLabel={'Log Collection'}
              submittingLabel="Recording..."
              amountLabel="Amount (₹)"
              amountPlaceholder="0.00"
              notesLabel="Notes / Fleet Slip ID"
              notesPlaceholder="Slip code, transaction ref..."
              paymentMethodLabel="Entry Type / Payment Method"
              usePaymentMethodButtons={true}
              walkInOptionLabel="-- Walk-in / Cash Customer --"
              customerOptionLabel={(cust) => `${cust.name} (${cust.customerType})`}
            />
          )}

          {quickEntryType === 'purchase' && (
            <PurchaseEntryForm
              shiftOptions={shiftOptions}
              suppliers={props.suppliers}
              products={props.products}
              tanks={props.tanks}
              defaultValues={props.purchaseDefaults}
              submitting={submitting}
              error={error}
              onCancel={onClose}
              onSubmit={props.onPurchaseSubmit}
              submitLabel="Add Purchase"
            />
          )}

          {quickEntryType === 'merchandise-sale' && (
            <MerchandiseSaleEntryForm
              shiftOptions={shiftOptions}
              products={props.products}
              customers={props.customers}
              attendants={props.attendants}
              stockByProduct={props.stockByProduct}
              defaultValues={props.merchandiseDefaults}
              submitting={submitting}
              error={error}
              onCancel={onClose}
              onSubmit={props.onMerchandiseSaleSubmit}
            />
          )}
        </>
      )}
    </Drawer>
  );
};
