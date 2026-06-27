import React from 'react';
import { Drawer } from '../Drawer.js';
import { ExpenseEntryForm } from '../transactions/ExpenseEntryForm.js';
import { CollectionEntryForm } from '../transactions/CollectionEntryForm.js';
import { CreditSaleEntryForm, VehicleSearchResult } from '../transactions/CreditSaleEntryForm.js';
import { PurchaseEntryForm } from '../transactions/PurchaseEntryForm.js';

type QuickEntryType = 'expense' | 'collection' | 'credit-sale' | 'purchase';

interface QuickEntryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  quickEntryType: QuickEntryType | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;

  shiftOptions: { id: string; label: string }[];
  targetShiftId: string;
  onTargetShiftIdChange: (id: string) => void;
  activeShiftTemplateName?: string;

  // Expense
  categories: any[];
  expenseCategoryId: string;
  onExpenseCategoryIdChange: (id: string) => void;
  expenseAmount: string;
  onExpenseAmountChange: (v: string) => void;
  expenseDescription: string;
  onExpenseDescriptionChange: (v: string) => void;
  onExpenseSubmit: (e: React.FormEvent) => void | Promise<void>;

  // Collection
  customers: any[];
  collectionCustomerId: string;
  onCollectionCustomerIdChange: (id: string) => void;
  collectionAmount: string;
  onCollectionAmountChange: (v: string) => void;
  collectionPaymentMethod: 'Cash' | 'Card' | 'UPI' | 'Credit';
  onCollectionPaymentMethodChange: (m: 'Cash' | 'Card' | 'UPI' | 'Credit') => void;
  collectionNotes: string;
  onCollectionNotesChange: (v: string) => void;
  onCollectionSubmit: (e: React.FormEvent) => void | Promise<void>;

  // Credit sale
  searchVehicles: (q: string) => Promise<VehicleSearchResult[]>;
  getPriceForProduct: (productId: string | null | undefined) => number | null;
  creditSaleVehicle: VehicleSearchResult | null;
  onCreditSaleVehicleChange: (v: VehicleSearchResult | null) => void;
  creditSaleQuantity: string;
  onCreditSaleQuantityChange: (v: string) => void;
  creditSaleUnitPrice: string;
  onCreditSaleUnitPriceChange: (v: string) => void;
  creditSaleAmount: string;
  onCreditSaleAmountChange: (v: string) => void;
  creditSaleNotes: string;
  onCreditSaleNotesChange: (v: string) => void;
  onCreditSaleSubmit: (e: React.FormEvent) => void | Promise<void>;

  // Purchase
  suppliers: any[];
  products: any[];
  purchaseSupplierId: string;
  onPurchaseSupplierIdChange: (id: string) => void;
  purchaseProductId: string;
  onPurchaseProductIdChange: (id: string) => void;
  purchaseQuantity: string;
  onPurchaseQuantityChange: (v: string) => void;
  purchaseTotalAmount: string;
  onPurchaseTotalAmountChange: (v: string) => void;
  purchaseInvoiceNumber: string;
  onPurchaseInvoiceNumberChange: (v: string) => void;
  purchaseNotes: string;
  onPurchaseNotesChange: (v: string) => void;
  isFuelPurchase: boolean;
  purchaseProductTanks: any[];
  purchaseAllocations: any;
  onPurchaseAllocationsChange: (a: any) => void;
  onPurchaseSubmit: (e: React.FormEvent) => void | Promise<void>;
}

/**
 * Slide-in quick-entry drawer for the active shift, hosting the expense / collection /
 * credit-sale / purchase entry forms. Extracted from ShiftsManagement; all state lives in
 * the parent and is passed through.
 */
export const QuickEntryDrawer: React.FC<QuickEntryDrawerProps> = (props) => {
  const {
    isOpen, onClose, quickEntryType, loading, submitting, error,
    shiftOptions, targetShiftId, onTargetShiftIdChange, activeShiftTemplateName,
  } = props;

  const title = (() => {
    const action =
      quickEntryType === 'expense'
        ? 'Add Expense'
        : quickEntryType === 'collection'
        ? 'Log Collection'
        : quickEntryType === 'credit-sale'
        ? 'Credit Sale'
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
              targetShiftId={targetShiftId}
              onTargetShiftIdChange={onTargetShiftIdChange}
              categoryId={props.expenseCategoryId}
              onCategoryIdChange={props.onExpenseCategoryIdChange}
              categories={props.categories}
              amount={props.expenseAmount}
              onAmountChange={props.onExpenseAmountChange}
              description={props.expenseDescription}
              onDescriptionChange={props.onExpenseDescriptionChange}
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
              targetShiftId={targetShiftId}
              onTargetShiftIdChange={onTargetShiftIdChange}
              customerId={props.collectionCustomerId}
              onCustomerIdChange={props.onCollectionCustomerIdChange}
              customers={props.customers}
              amount={props.collectionAmount}
              onAmountChange={props.onCollectionAmountChange}
              paymentMethod={props.collectionPaymentMethod}
              onPaymentMethodChange={props.onCollectionPaymentMethodChange}
              notes={props.collectionNotes}
              onNotesChange={props.onCollectionNotesChange}
              submitting={submitting}
              error={error}
              onCancel={onClose}
              onSubmit={props.onCollectionSubmit}
              submitLabel={props.collectionPaymentMethod === 'Credit' ? 'Log Credit Sale' : 'Log Collection'}
              submittingLabel="Recording..."
              submitDisabled={submitting || !props.collectionAmount}
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

          {quickEntryType === 'credit-sale' && (
            <CreditSaleEntryForm
              shiftOptions={shiftOptions}
              targetShiftId={targetShiftId}
              onTargetShiftIdChange={onTargetShiftIdChange}
              searchVehicles={props.searchVehicles}
              getPriceForProduct={props.getPriceForProduct}
              selectedVehicle={props.creditSaleVehicle}
              onSelectedVehicleChange={props.onCreditSaleVehicleChange}
              quantity={props.creditSaleQuantity}
              onQuantityChange={props.onCreditSaleQuantityChange}
              unitPrice={props.creditSaleUnitPrice}
              onUnitPriceChange={props.onCreditSaleUnitPriceChange}
              amount={props.creditSaleAmount}
              onAmountChange={props.onCreditSaleAmountChange}
              notes={props.creditSaleNotes}
              onNotesChange={props.onCreditSaleNotesChange}
              submitting={submitting}
              error={error}
              onCancel={onClose}
              onSubmit={props.onCreditSaleSubmit}
            />
          )}

          {quickEntryType === 'purchase' && (
            <PurchaseEntryForm
              shiftOptions={shiftOptions}
              targetShiftId={targetShiftId}
              onTargetShiftIdChange={onTargetShiftIdChange}
              supplierId={props.purchaseSupplierId}
              onSupplierIdChange={props.onPurchaseSupplierIdChange}
              suppliers={props.suppliers}
              productId={props.purchaseProductId}
              onProductIdChange={props.onPurchaseProductIdChange}
              products={props.products}
              quantity={props.purchaseQuantity}
              onQuantityChange={props.onPurchaseQuantityChange}
              totalAmount={props.purchaseTotalAmount}
              onTotalAmountChange={props.onPurchaseTotalAmountChange}
              invoiceNumber={props.purchaseInvoiceNumber}
              onInvoiceNumberChange={props.onPurchaseInvoiceNumberChange}
              notes={props.purchaseNotes}
              onNotesChange={props.onPurchaseNotesChange}
              isFuel={props.isFuelPurchase}
              productTanks={props.purchaseProductTanks}
              allocations={props.purchaseAllocations}
              onAllocationsChange={props.onPurchaseAllocationsChange}
              submitting={submitting}
              error={error}
              onCancel={onClose}
              onSubmit={props.onPurchaseSubmit}
              submitLabel="Add Purchase"
            />
          )}
        </>
      )}
    </Drawer>
  );
};
