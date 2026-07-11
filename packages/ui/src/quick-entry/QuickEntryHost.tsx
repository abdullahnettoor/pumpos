import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveBusinessDate } from '@pump/shared';
import type {
  ExpenseEntryFormValues,
  CollectionEntryFormValues,
  PurchaseEntryFormValues,
  MerchandiseSaleEntryFormValues,
} from '@pump/shared';
import { Drawer } from '../components/Drawer.js';
import { ExpenseEntryForm } from '../components/transactions/ExpenseEntryForm.js';
import { CollectionEntryForm } from '../components/transactions/CollectionEntryForm.js';
import { PurchaseEntryForm } from '../components/transactions/PurchaseEntryForm.js';
import { MerchandiseSaleEntryForm } from '../components/transactions/MerchandiseSaleEntryForm.js';
import { useToast } from '../components/primitives/ToastProvider.js';
import {
  CloudTransactionService, CloudProductService, CloudTankService, CloudUserAssignmentService,
} from '../services/cloud.js';
import { useShiftStatus, useInvalidateOperational, queryKeys, TIER } from '../query/hooks.js';
import { useQuickEntry, closeQuickEntry, type QuickEntryType } from './store.js';

const txService = new CloudTransactionService();
const productService = new CloudProductService();
const tankService = new CloudTankService();
const userService = new CloudUserAssignmentService();

interface QuickEntryHostProps {
  selectedStation: any | null;
}

const TITLE: Record<QuickEntryType, string> = {
  expense: 'Add Expense',
  collection: 'Log Collection',
  purchase: 'Add Purchase',
  'merchandise-sale': 'Merchandise Sale',
};

/**
 * QuickEntryHost — one drawer mounted at the app shell that renders the shared
 * entry forms on demand (driven by the global quick-entry store). Opens IN
 * PLACE from anywhere (command palette, shift bar) with no route change. Shift
 * is auto-filled when open; merchandise sale requires an open shift and blocks
 * with a warning otherwise (per-entry gating).
 */
export const QuickEntryHost: React.FC<QuickEntryHostProps> = ({ selectedStation }) => {
  const qe = useQuickEntry();
  const qc = useQueryClient();
  const toast = useToast();
  const invalidateOperational = useInvalidateOperational();

  const stationId = selectedStation?.id ?? null;
  const settings = (selectedStation?.settings ?? {}) as { timezone?: string; business_day_starts_at?: string };
  const clock = { timeZone: settings.timezone, dayStartsAt: settings.business_day_starts_at };

  const statusQ = useShiftStatus(stationId, false, { enabled: !!stationId } as any);
  const activeShift = statusQ.data?.activeShift ?? null;
  const activeShiftId: string | undefined = activeShift?.id;

  const [categories, setCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [sellers, setSellers] = useState<{ userId: string; userName: string }[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the lookups a given entry type needs (cached; runs on each open).
  useEffect(() => {
    if (!qe.open || !qe.type || !stationId) return;
    let cancelled = false;
    const type = qe.type;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        if (type === 'expense') {
          const cats = await qc.ensureQueryData({ queryKey: queryKeys.expenseCategories(), queryFn: () => txService.getExpenseCategories(), staleTime: TIER.semi.staleTime });
          if (!cancelled) setCategories(cats || []);
        } else if (type === 'collection') {
          const custs = await qc.ensureQueryData({ queryKey: queryKeys.customers(true), queryFn: () => txService.getCustomers(true), staleTime: TIER.semi.staleTime });
          if (!cancelled) setCustomers(custs || []);
        } else if (type === 'purchase') {
          const [sups, prods, tks] = await Promise.all([
            qc.ensureQueryData({ queryKey: queryKeys.suppliers(true), queryFn: () => txService.getSuppliers(true), staleTime: TIER.semi.staleTime }),
            qc.ensureQueryData({ queryKey: queryKeys.products(), queryFn: () => productService.listProducts(), staleTime: TIER.semi.staleTime }),
            qc.ensureQueryData({ queryKey: queryKeys.tanks(stationId), queryFn: () => tankService.listTanks(stationId), staleTime: TIER.static.staleTime }),
          ]);
          if (!cancelled) { setSuppliers(sups || []); setProducts(prods || []); setTanks(tks || []); }
        } else if (type === 'merchandise-sale') {
          const [prods, custs, items] = await Promise.all([
            qc.ensureQueryData({ queryKey: queryKeys.products(), queryFn: () => productService.listProducts(), staleTime: TIER.semi.staleTime }),
            qc.ensureQueryData({ queryKey: queryKeys.customers(true), queryFn: () => txService.getCustomers(true), staleTime: TIER.semi.staleTime }),
            txService.getInventoryItems(stationId).catch(() => []),
          ]);
          const users = await qc.ensureQueryData({ queryKey: queryKeys.users(), queryFn: () => userService.listUsers(), staleTime: TIER.static.staleTime }).catch(() => []);
          if (cancelled) return;
          setProducts((prods || []).filter((p: any) => p.productType !== 'FUEL'));
          setCustomers(custs || []);
          const stockMap: Record<string, number> = {};
          (items || []).forEach((i: any) => { stockMap[i.productId] = Number(i.quantity); });
          setStock(stockMap);
          setSellers((users || []).filter((u: any) => (u.status ? u.status === 'ACTIVE' : true)).map((u: any) => ({ userId: u.id, userName: u.fullName || u.email || 'User' })));
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load form data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qe.token, qe.open, qe.type, stationId]);

  const businessDate = useMemo(() => resolveBusinessDate({ timeZone: clock.timeZone, dayStartsAt: clock.dayStartsAt }), [clock.timeZone, clock.dayStartsAt]);
  const shiftOptions = activeShift ? [{ id: activeShift.id, label: `${activeShift.templateName} (Open)` }] : [];
  const extra = (qe.defaults ?? {}) as Record<string, any>;

  const close = () => { setError(null); setSubmitting(false); closeQuickEntry(); };
  const done = (msg: string) => { toast.success(msg); invalidateOperational(stationId); close(); };

  const handleExpense = async (values: ExpenseEntryFormValues) => {
    try {
      setSubmitting(true); setError(null);
      const shiftId = values.targetShiftId || activeShiftId;
      await txService.recordExpense(
        shiftId
          ? { shiftId, categoryId: values.categoryId, amount: Number(values.amount), description: values.description || undefined, accountId: values.accountId || undefined }
          : { stationId: stationId ?? undefined, transactionDate: businessDate, paidFrom: 'BANK', categoryId: values.categoryId, amount: Number(values.amount), description: values.description || undefined, accountId: values.accountId || undefined },
      );
      done('Expense recorded.');
    } catch (err: any) { setError(err.message || 'Failed to record expense'); } finally { setSubmitting(false); }
  };

  const handleCollection = async (values: CollectionEntryFormValues) => {
    try {
      setSubmitting(true); setError(null);
      const shiftId = values.targetShiftId || activeShiftId;
      const base = { customerId: values.customerId || undefined, amount: Number(values.amount), paymentMethod: values.paymentMethod, notes: values.notes || undefined, accountId: values.accountId || undefined };
      await txService.recordCollection(shiftId ? { shiftId, ...base } : { stationId: stationId ?? undefined, transactionDate: businessDate, ...base });
      done('Collection recorded.');
    } catch (err: any) { setError(err.message || 'Failed to record collection'); } finally { setSubmitting(false); }
  };

  const handlePurchase = async (values: PurchaseEntryFormValues) => {
    if (!values.supplierId || values.lines.length === 0) { setError('Select a supplier and at least one line.'); return; }
    try {
      setSubmitting(true); setError(null);
      await txService.recordPurchase({
        stationId: stationId ?? undefined,
        transactionDate: businessDate,
        supplierId: values.supplierId,
        invoiceNumber: values.invoiceNumber || undefined,
        notes: values.notes || undefined,
        lines: values.lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), tankAllocations: l.tankAllocations && l.tankAllocations.length > 0 ? l.tankAllocations : undefined })),
      });
      done('Purchase recorded.');
    } catch (err: any) { setError(err.message || 'Failed to record purchase'); } finally { setSubmitting(false); }
  };

  const handleMerchandise = async (values: MerchandiseSaleEntryFormValues) => {
    const shiftId = values.targetShiftId || activeShiftId;
    if (!shiftId) { setError('A shift must be open to record a merchandise sale.'); return; }
    const lines = (values.lines || []).filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0, tankId: null }));
    if (lines.length === 0) { setError('Add at least one product with a quantity.'); return; }
    try {
      setSubmitting(true); setError(null);
      const buyerName = (values.buyerName || '').trim();
      const useBuyer = values.paymentMethod !== 'Credit' && !values.customerId && !!buyerName;
      await txService.recordSale({
        shiftId,
        paymentMethod: values.paymentMethod,
        lines,
        customerId: values.paymentMethod === 'Credit' ? values.customerId : (values.customerId || undefined),
        attendantId: values.attendantId || undefined,
        notes: values.notes || undefined,
        buyer: useBuyer ? { name: buyerName, phone: (values.buyerPhone || '').trim() || null, gstin: (values.buyerGstin || '').trim() || null, stateCode: (values.buyerStateCode || '').trim() || null } : undefined,
        saveAsCustomer: useBuyer ? !!values.saveAsCustomer : undefined,
      });
      done('Sale recorded.');
    } catch (err: any) { setError(err.message || 'Failed to record merchandise sale'); } finally { setSubmitting(false); }
  };

  if (!qe.open || !qe.type) return null;
  const type = qe.type;
  const title = activeShift ? `${activeShift.templateName} · ${TITLE[type]}` : TITLE[type];

  return (
    <Drawer isOpen={qe.open} onClose={close} title={title}>
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
      ) : type === 'merchandise-sale' && !activeShiftId ? (
        <div style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', padding: '14px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-soft)', fontSize: '13px' }}>
          A shift must be open to record a merchandise sale. Open a shift, then try again.
        </div>
      ) : type === 'expense' ? (
        <ExpenseEntryForm
          shiftOptions={shiftOptions}
          categories={categories}
          stationId={stationId}
          defaultValues={{ targetShiftId: activeShiftId ?? '', categoryId: categories[0]?.id ?? '', ...extra }}
          showDateField={!activeShiftId}
          dateLabel="Expense Date"
          showShiftHintWhenSingle={!!activeShiftId}
          submitting={submitting}
          error={error}
          amountLabel="Amount (₹)"
          onCancel={close}
          onSubmit={handleExpense}
          submitLabel="Add Expense"
        />
      ) : type === 'collection' ? (
        <CollectionEntryForm
          shiftOptions={shiftOptions}
          customers={customers}
          stationId={stationId}
          requireCustomer
          defaultValues={{ targetShiftId: activeShiftId ?? '', customerId: '', paymentMethod: 'Cash', ...extra }}
          showDateField={!activeShiftId}
          dateLabel="Collection Date"
          showShiftHintWhenSingle={!!activeShiftId}
          submitting={submitting}
          error={error}
          amountLabel="Amount (₹)"
          notesLabel="Notes / Fleet Slip ID"
          paymentMethodLabel="Payment Method"
          usePaymentMethodButtons
          customerOptionLabel={(cust) => `${cust.name} (${cust.customerType})`}
          onCancel={close}
          onSubmit={handleCollection}
          submitLabel="Log Collection"
        />
      ) : type === 'purchase' ? (
        <PurchaseEntryForm
          shiftOptions={shiftOptions}
          suppliers={suppliers}
          products={products}
          tanks={tanks}
          defaultValues={{ supplierId: suppliers[0]?.id ?? '', lines: [{ productId: products[0]?.id ?? '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number }], ...extra }}
          submitting={submitting}
          error={error}
          onCancel={close}
          onSubmit={handlePurchase}
          submitLabel="Add Purchase"
        />
      ) : (
        <MerchandiseSaleEntryForm
          shiftOptions={shiftOptions}
          products={products}
          customers={customers}
          attendants={sellers}
          stockByProduct={stock}
          defaultValues={{ targetShiftId: activeShiftId ?? '', paymentMethod: 'Cash', attendantId: sellers[0]?.userId ?? '', lines: [{ productId: products[0]?.id ?? '', quantity: undefined as unknown as number, unitPrice: (products[0]?.sellingPrice != null ? Number(products[0].sellingPrice) : undefined) as unknown as number }], ...extra }}
          submitting={submitting}
          error={error}
          onCancel={close}
          onSubmit={handleMerchandise}
        />
      )}
    </Drawer>
  );
};
