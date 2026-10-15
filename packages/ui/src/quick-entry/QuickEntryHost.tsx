import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MerchandiseSaleEntryFormValues, Role } from '@pump/shared';
import { Drawer } from '../components/Drawer.js';
import { MerchandiseSaleEntryForm } from '../components/transactions/MerchandiseSaleEntryForm.js';
import { useToast } from '../components/primitives/ToastProvider.js';
import { useRunTask } from '../utils/runTask.js';
import {
  CloudTransactionService,
  CloudProductService,
  CloudUserAssignmentService,
} from '../services/cloud.js';
import { useShiftStatus, useRecordProductSale, queryKeys, TIER } from '../query/hooks.js';
import { officeSubmitKeys, sendKeyed } from '../office-records/submitKeys.js';
import { OfficeRecordDrawer } from '../office-records/OfficeRecordDrawer.js';
import { isOfficeRecordKind } from '../office-records/kinds.js';
import { productSaleLabels } from './productSaleLabels.js';
import { useQuickEntry, closeQuickEntry } from './store.js';

const txService = new CloudTransactionService();
const productService = new CloudProductService();
const userService = new CloudUserAssignmentService();

interface QuickEntryHostProps {
  selectedStation: any | null;
  /** The signed-in role: decides balances and "+ New category…". */
  userRole?: Role;
}

/**
 * QuickEntryHost — mounted once at the app shell, it renders the entry drawer
 * the global quick-entry store asks for, IN PLACE with no route change.
 *
 * Office Records (expense, income, collection, purchase, supplier payment) all
 * open `OfficeRecordDrawer`: the same title, fields and submit from a page, the
 * New menu, a statement or Shifts (#526). A merchandise sale is a forecourt
 * sale: it needs an open shift and blocks with a warning otherwise.
 */
export const QuickEntryHost: React.FC<QuickEntryHostProps> = ({
  selectedStation,
  userRole = 'Staff',
}) => {
  const qe = useQuickEntry();
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();

  const stationId = selectedStation?.id ?? null;
  const isSale = qe.open && qe.type === 'merchandise-sale';

  // Lite mode: only the open shift's identity is needed for attribution.
  const statusQ = useShiftStatus(stationId, { lite: true, enabled: !!stationId && isSale });
  const activeShift = statusQ.data?.activeShift ?? null;
  const activeShiftId: string | undefined = activeShift?.id;

  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [sellers, setSellers] = useState<{ userId: string; userName: string }[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recordSale = useRecordProductSale(stationId);
  // One Idempotency-Key session per open of the drawer: a retry after a lost
  // answer reuses the key, so the sale cannot land twice (#606).
  const sessionOwner = `${qe.token}:${stationId ?? ''}`;
  const [saleKeys, setSaleKeys] = useState(() => ({
    owner: sessionOwner,
    session: officeSubmitKeys.session(`product-sale:${stationId ?? ''}`),
  }));
  if (saleKeys.owner !== sessionOwner) {
    setSaleKeys({
      owner: sessionOwner,
      session: officeSubmitKeys.session(`product-sale:${stationId ?? ''}`),
    });
  }
  const [error, setError] = useState<string | null>(null);

  // Load the lookups a merchandise sale needs (cached; runs on each open).
  useEffect(() => {
    if (!isSale || !stationId) return;
    let cancelled = false;
    runTask(
      (async () => {
        try {
          setLoading(true);
          setError(null);
          const [prods, custs, items] = await Promise.all([
            qc.ensureQueryData({
              queryKey: queryKeys.products(),
              queryFn: () => productService.listProducts(),
              staleTime: TIER.semi.staleTime,
            }),
            qc.ensureQueryData({
              queryKey: queryKeys.customers(true),
              queryFn: () => txService.getCustomers(true),
              staleTime: TIER.semi.staleTime,
            }),
            txService.getInventoryItems(stationId).catch(() => []),
          ]);
          const users = await qc
            .ensureQueryData({
              queryKey: queryKeys.users(),
              queryFn: () => userService.listUsers(),
              staleTime: TIER.static.staleTime,
            })
            .catch(() => []);
          if (cancelled) return;
          setProducts((prods || []).filter((p: any) => p.productType !== 'FUEL'));
          setCustomers(custs || []);
          const stockMap: Record<string, number> = {};
          (items || []).forEach((i: any) => {
            stockMap[i.productId] = Number(i.quantity);
          });
          setStock(stockMap);
          setSellers(
            (users || [])
              .filter((u: any) => (u.status ? u.status === 'ACTIVE' : true))
              .map((u: any) => ({ userId: u.id, userName: u.fullName || u.email || 'User' })),
          );
        } catch (err: any) {
          if (!cancelled) setError(err.message || 'Failed to load form data');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })(),
      'Could not load the quick-entry form.',
    );
    return () => {
      cancelled = true;
    };
    // `qc` and `runTask` are both referentially stable (useQueryClient, and a
    // memoised toast context), so listing them costs nothing.
  }, [qe.token, isSale, stationId, qc, runTask]);

  const shiftOptions = activeShift
    ? [{ id: activeShift.id, label: `${activeShift.templateName} (Open)` }]
    : [];

  const close = () => {
    setError(null);
    setSubmitting(false);
    closeQuickEntry();
  };

  const handleMerchandise = async (values: MerchandiseSaleEntryFormValues) => {
    const shiftId = values.targetShiftId || activeShiftId;
    if (!shiftId) {
      setError('A shift must be open to record a product sale.');
      return;
    }
    const lines = (values.lines || [])
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
        tankId: null,
      }));
    if (lines.length === 0) {
      setError('Add at least one product with a quantity.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const buyerName = (values.buyerName || '').trim();
      const useBuyer = values.paymentMethod !== 'Credit' && !values.customerId && !!buyerName;
      const payload = {
        shiftId,
        paymentMethod: values.paymentMethod,
        lines,
        customerId:
          values.paymentMethod === 'Credit' ? values.customerId : values.customerId || undefined,
        attendantId: values.attendantId || undefined,
        notes: values.notes || undefined,
        buyer: useBuyer
          ? {
              name: buyerName,
              phone: (values.buyerPhone || '').trim() || null,
              gstin: (values.buyerGstin || '').trim() || null,
              stateCode: (values.buyerStateCode || '').trim() || null,
            }
          : undefined,
        saveAsCustomer: useBuyer ? !!values.saveAsCustomer : undefined,
      };
      const labels = productSaleLabels(payload, { sellers, products, customers });
      await sendKeyed(saleKeys.session, { stationId, payload }, (idempotencyKey) =>
        recordSale.mutateAsync({ payload, idempotencyKey, labels }),
      );
      toast.success('Sale recorded.');
      close();
    } catch (err: any) {
      setError(err.message || 'Failed to record the product sale');
    } finally {
      setSubmitting(false);
    }
  };

  if (!qe.open || !qe.type) return null;

  if (isOfficeRecordKind(qe.type)) {
    return (
      <OfficeRecordDrawer
        kind={qe.type}
        openToken={qe.token}
        station={selectedStation}
        userRole={userRole}
        launch={qe.launch}
        onClose={closeQuickEntry}
      />
    );
  }

  // A merchandise sale is shift-anchored, so its title names the shift.
  const title = activeShift ? `${activeShift.templateName} · Product sale` : 'Product sale';

  return (
    <Drawer isOpen={qe.open} onClose={close} title={title}>
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
      ) : !activeShiftId ? (
        <div
          style={{
            backgroundColor: 'var(--state-warning-bg)',
            color: 'var(--state-warning-fg)',
            padding: '14px',
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--border-soft)',
            fontSize: '13px',
          }}
        >
          A shift must be open to record a product sale. Open a shift, then try again.
        </div>
      ) : (
        <MerchandiseSaleEntryForm
          shiftOptions={shiftOptions}
          products={products}
          customers={customers}
          attendants={sellers}
          stockByProduct={stock}
          defaultValues={{
            targetShiftId: activeShiftId ?? '',
            paymentMethod: 'Cash',
            attendantId: sellers[0]?.userId ?? '',
            lines: [
              {
                productId: products[0]?.id ?? '',
                quantity: undefined as unknown as number,
                unitPrice: (products[0]?.sellingPrice != null
                  ? Number(products[0].sellingPrice)
                  : undefined) as unknown as number,
              },
            ],
            ...((qe.launch?.defaults ?? {}) as Record<string, any>),
          }}
          submitting={submitting}
          error={error}
          onCancel={close}
          onSubmit={handleMerchandise}
        />
      )}
    </Drawer>
  );
};
