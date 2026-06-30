import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudProductService, CloudShiftService, CloudTankService, CloudTransactionService, CloudUserAssignmentService } from '../../services/cloud.js';
import { StatusBadge } from '../StatusBadge.js';
import { ShiftSummaryView } from './ShiftSummaryView.js';
import { HandoverDrawer } from './HandoverDrawer.js';
import { ShiftControlBar } from './ShiftControlBar.js';
import { ShiftHistoryTab } from './ShiftHistoryTab.js';
import { CloseShiftWizard } from './CloseShiftWizard.js';
import { ShiftCloseSuccess } from './ShiftCloseSuccess.js';
import { AttendantHandoversDashboard } from './AttendantHandoversDashboard.js';
import { NozzleReadingsGrid } from './NozzleReadingsGrid.js';
import { ShiftTotalsSummary } from './ShiftTotalsSummary.js';
import { OpenShiftForm } from './OpenShiftForm.js';
import { QuickEntryDrawer } from './QuickEntryDrawer.js';
import { Tabs } from '../primitives/Tabs.js';
import { useShiftStatus, useInvalidateOperational, queryKeys, TIER } from '../../query/hooks.js';
import { Station, resolveBusinessDate } from '@pump/shared';
import type {
  ExpenseEntryFormValues,
  CollectionEntryFormValues,
  PurchaseEntryFormValues,
  MerchandiseSaleEntryFormValues,
} from '@pump/shared';
import { FileText, User, Lock, AlertTriangle, Check, Fuel, Info, Play, CalendarRange, History, Clock3 } from 'lucide-react';
import { LoadingSpinner } from '../LoadingSpinner.js';

const shiftService = new CloudShiftService();
const transactionService = new CloudTransactionService();
const productService = new CloudProductService();
const tankService = new CloudTankService();
const userService = new CloudUserAssignmentService();

type QuickEntryType = 'expense' | 'collection' | 'purchase' | 'merchandise-sale';

interface ShiftsManagementProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  onNavigate?: (path: string) => void;
}

export const ShiftsManagement: React.FC<ShiftsManagementProps> = ({
  selectedStation,
  userRole,
  userName,
  onNavigate,
}) => {
  const stationId = selectedStation?.id ?? null;
  const statusQ = useShiftStatus(stationId, false, { refetchOnWindowFocus: false });
  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const data = statusQ.data ?? null;
  const loading = statusQ.isLoading;
  const error = statusQ.error as Error | null;
  const [viewingShiftSummary, setViewingShiftSummary] = useState(false);

  // Shift Tab Sub-Navigation
  const [shiftSubTab, setShiftSubTab] = useState<'today' | 'planning' | 'history'>('today');
  const [viewHistoryShiftId, setViewHistoryShiftId] = useState<string | null>(null);

  // Open Shift Form States
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [businessDate, setBusinessDate] = useState(() => resolveBusinessDate());
  const [openingCash, setOpeningCash] = useState(0);
  const [staffAssignments, setStaffAssignments] = useState<{ userId: string; duId: string }[]>([]);
  // Terminal→DU assignment for the shift being opened. duId '' means shift-wide (any DU).
  const [terminalAssignments, setTerminalAssignments] = useState<{ terminalId: string; duId: string }[]>([]);
  const [initialReadings, setInitialReadings] = useState<{ nozzleId: string; openingReading: number }[]>([]);
  const [isOpening, setIsOpening] = useState(false);

  // Default the shift-open business date to the station's *local* business date
  // (its timezone + day-start boundary), recomputed when the station changes.
  useEffect(() => {
    const s = (selectedStation?.settings ?? {}) as { timezone?: string; business_day_starts_at?: string };
    setBusinessDate(resolveBusinessDate({ timeZone: s.timezone, dayStartsAt: s.business_day_starts_at }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation?.id]);

  // Active Shift Workspace States
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});

  // Close Flow Inline States
  const [isPreparingClose, setIsPreparingClose] = useState(false);
  const [closeWizardOpen, setCloseWizardOpen] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [confirmWarningsChecked, setConfirmWarningsChecked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [stationTanks, setStationTanks] = useState<any[]>([]);
  const [dipReadings, setDipReadings] = useState<Record<string, number | string>>({});
  const [closedShiftSuccess, setClosedShiftSuccess] = useState<{
    expectedCash: number;
    closingCash: number;
    variance: number;
    lastClosedShiftId: string;
    nextTemplateId: string;
  } | null>(null);

  // Handover Drawer states
  const [handoverDrawerOpen, setHandoverDrawerOpen] = useState(false);
  const [selectedHandoverAssignment, setSelectedHandoverAssignment] = useState<any>(null);
  const [handoverCreditCustomers, setHandoverCreditCustomers] = useState<any[]>([]);

  const handleOpenHandoverDrawer = async (assignment: any) => {
    setSelectedHandoverAssignment(assignment);
    setHandoverDrawerOpen(true);
    // Load credit-eligible customers for the in-handover fuel-on-credit section.
    try {
      const custList = await qc.ensureQueryData({ queryKey: queryKeys.customers(true), queryFn: () => transactionService.getCustomers(true), staleTime: TIER.semi.staleTime });
      setHandoverCreditCustomers((custList || []).filter((c: any) => !c.isPrepaid && (c.customerType === 'Credit' || c.customerType === 'Fleet')));
    } catch {
      setHandoverCreditCustomers([]);
    }
  };

  const [shiftTotals, setShiftTotals] = useState({
    cashCollections: 0,
    cashExpenses: 0,
    cardCollections: 0,
    upiCollections: 0,
    creditSales: 0,
    expenseCount: 0,
    purchaseCount: 0,
    purchaseTotal: 0,
  });

  // Quick Entry Drawer states (local to Shift Management)
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [quickEntryType, setQuickEntryType] = useState<QuickEntryType | null>(null);
  const [quickEntryLoading, setQuickEntryLoading] = useState(false);
  const [quickEntrySubmitting, setQuickEntrySubmitting] = useState(false);
  const [quickEntryError, setQuickEntryError] = useState<string | null>(null);
  const [targetShiftId, setTargetShiftId] = useState('');
  const [recentClosedShifts, setRecentClosedShifts] = useState<any[]>([]);

  const [categories, setCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);

  const [expenseDefaults, setExpenseDefaults] = useState<Partial<ExpenseEntryFormValues>>({});
  const [collectionDefaults, setCollectionDefaults] = useState<Partial<CollectionEntryFormValues>>({});
  const [purchaseDefaults, setPurchaseDefaults] = useState<Partial<PurchaseEntryFormValues>>({});
  const [merchandiseDefaults, setMerchandiseDefaults] = useState<Partial<MerchandiseSaleEntryFormValues>>({});

  const [saleStock, setSaleStock] = useState<Record<string, number>>({});
  // Merchandise can be sold by ANY station user (incl. office staff not on a DU/shift).
  const [merchandiseSellers, setMerchandiseSellers] = useState<{ userId: string; userName: string }[]>([]);

  // Attendants (operators) assigned to the active shift, for sale attribution.
  const shiftAttendants = useMemo(() => {
    const assignments = (statusQ.data?.activeShift?.staffAssignments as any[]) || [];
    const seen = new Map<string, string>();
    for (const a of assignments) {
      if (a.userId && !seen.has(a.userId)) seen.set(a.userId, a.userName || 'Attendant');
    }
    return Array.from(seen.entries()).map(([userId, userName]) => ({ userId, userName }));
  }, [statusQ.data]);

  const loadShiftTotals = async (shiftId: string) => {
    try {
      const txs = await transactionService.getShiftTransactions(shiftId);
      
      const cashCollections = txs.collections
        .filter((c: any) => c.paymentMethod === 'Cash')
        .reduce((sum: number, c: any) => sum + Number(c.amount), 0);
      
      const cardCollections = txs.collections
        .filter((c: any) => c.paymentMethod === 'Card')
        .reduce((sum: number, c: any) => sum + Number(c.amount), 0);
      
      const upiCollections = txs.collections
        .filter((c: any) => c.paymentMethod === 'UPI')
        .reduce((sum: number, c: any) => sum + Number(c.amount), 0);
      
      const creditSales = (txs.creditSales || [])
        .reduce((sum: number, r: any) => sum + Number(r.amount), 0);

      const cashExpenses = txs.expenses
        .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
      
      const expenseCount = txs.expenses.length;
      
      const purchaseCount = txs.purchases.length;
      const purchaseTotal = txs.purchases.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      
      setShiftTotals({
        cashCollections,
        cashExpenses,
        cardCollections,
        upiCollections,
        creditSales,
        expenseCount,
        purchaseCount,
        purchaseTotal,
      });
    } catch (err) {
      console.error('Failed to load shift totals', err);
    }
  };

  const resetQuickEntryForms = () => {
    setExpenseDefaults({});
    setCollectionDefaults({});
    setPurchaseDefaults({});
    setMerchandiseDefaults({});
  };

  const closeQuickEntryDrawer = () => {
    setQuickEntryOpen(false);
    setQuickEntryType(null);
    setQuickEntryError(null);
    setQuickEntrySubmitting(false);
    resetQuickEntryForms();
  };

  const loadQuickEntryLookups = async (type: QuickEntryType) => {
    if (!selectedStation || !data?.activeShift?.id) {
      return;
    }

    try {
      setQuickEntryLoading(true);
      setQuickEntryError(null);

      const shiftStatus = await shiftService.getShiftStatus(selectedStation.id, true);
      const closedList = shiftStatus.recentClosedShifts || [];
      setRecentClosedShifts(closedList);
      setTargetShiftId(data.activeShift.id);

      if (type === 'expense') {
        const expenseCategories = await qc.ensureQueryData({ queryKey: queryKeys.expenseCategories(), queryFn: () => transactionService.getExpenseCategories(), staleTime: TIER.semi.staleTime });
        setCategories(expenseCategories || []);
        setExpenseDefaults({ targetShiftId: data.activeShift.id, categoryId: expenseCategories?.[0]?.id ?? '' });
      }

      if (type === 'collection') {
        const activeCustomers = await qc.ensureQueryData({ queryKey: queryKeys.customers(true), queryFn: () => transactionService.getCustomers(true), staleTime: TIER.semi.staleTime });
        setCustomers(activeCustomers || []);
        setCollectionDefaults({ targetShiftId: data.activeShift.id, customerId: activeCustomers?.[0]?.id ?? '', paymentMethod: 'Cash' });
      }

      if (type === 'merchandise-sale') {
        const [productList, activeCustomers, items] = await Promise.all([
          qc.ensureQueryData({ queryKey: queryKeys.products(), queryFn: () => productService.listProducts(), staleTime: TIER.semi.staleTime }),
          qc.ensureQueryData({ queryKey: queryKeys.customers(true), queryFn: () => transactionService.getCustomers(true), staleTime: TIER.semi.staleTime }),
          transactionService.getInventoryItems(selectedStation.id).catch(() => []),
        ]);
        const nonFuel = (productList || []).filter((p: any) => p.productType !== 'FUEL');
        setProducts(nonFuel);
        setCustomers(activeCustomers || []);
        const stockMap: Record<string, number> = {};
        (items || []).forEach((i: any) => { stockMap[i.productId] = Number(i.quantity); });
        setSaleStock(stockMap);
        // Merchandise sellers = all active station users (office staff included),
        // not just DU/shift-assigned attendants.
        const users = await qc.ensureQueryData({ queryKey: queryKeys.users(), queryFn: () => userService.listUsers(), staleTime: TIER.static.staleTime }).catch(() => []);
        const sellers = (users || [])
          .filter((u: any) => (u.status ? u.status === 'ACTIVE' : true))
          .map((u: any) => ({ userId: u.id, userName: u.fullName || u.email || 'User' }));
        setMerchandiseSellers(sellers);
        setMerchandiseDefaults({
          targetShiftId: data.activeShift.id,
          productId: nonFuel?.[0]?.id ?? '',
          unitPrice: (nonFuel?.[0]?.sellingPrice != null ? Number(nonFuel[0].sellingPrice) : undefined) as unknown as number,
          paymentMethod: 'Cash',
          attendantId: sellers[0]?.userId ?? '',
        });
      }

      if (type === 'purchase') {
        const [activeSuppliers, productList, tankList] = await Promise.all([
          qc.ensureQueryData({ queryKey: queryKeys.suppliers(true), queryFn: () => transactionService.getSuppliers(true), staleTime: TIER.semi.staleTime }),
          qc.ensureQueryData({ queryKey: queryKeys.products(), queryFn: () => productService.listProducts(), staleTime: TIER.semi.staleTime }),
          qc.ensureQueryData({ queryKey: queryKeys.tanks(selectedStation.id), queryFn: () => tankService.listTanks(selectedStation.id), staleTime: TIER.static.staleTime }),
        ]);

        setSuppliers(activeSuppliers || []);
        setProducts(productList || []);
        setTanks(tankList || []);
        setPurchaseDefaults({
          targetShiftId: data.activeShift.id,
          supplierId: activeSuppliers?.[0]?.id ?? '',
          lines: [{ productId: productList?.[0]?.id ?? '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number }],
        });
      }
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to load quick-entry data');
    } finally {
      setQuickEntryLoading(false);
    }
  };

  const openQuickEntryDrawer = async (type: QuickEntryType) => {
    if (!data?.activeShift?.id) {
      return;
    }

    // Minimize close wizard if open — preserves draft state, user can resume via "Continue Close"
    if (closeWizardOpen) {
      setCloseWizardOpen(false);
    }

    setQuickEntryType(type);
    setQuickEntryOpen(true);
    await loadQuickEntryLookups(type);
  };

  const openingCashNum = data?.activeShift ? Number(data.activeShift.openingCash) : 0;
  const handovers = data?.activeShift?.handovers || [];
  const hasHandovers = handovers.length > 0;

  const totalCashHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.cashHandedOver || 0), 0);
  const totalCardHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.cardHandedOver || 0), 0);
  const totalUpiHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.upiHandedOver || 0), 0);
  const totalCreditHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.creditHandedOver || 0), 0);

  const activeCashCollections = hasHandovers ? totalCashHandedOver : shiftTotals.cashCollections;
  const activeCardCollections = hasHandovers ? totalCardHandedOver : shiftTotals.cardCollections;
  const activeUpiCollections = hasHandovers ? totalUpiHandedOver : shiftTotals.upiCollections;
  const activeCreditSales = hasHandovers ? totalCreditHandedOver : shiftTotals.creditSales;

  const expectedCash = openingCashNum + activeCashCollections - shiftTotals.cashExpenses;
  const cashVariance = closingCash - expectedCash;

  // Reactively compute close warnings when close flow is active
  const warnings: string[] = [];

  if (data?.activeShift && isPreparingClose) {
    let zeroVolumeCount = 0;
    for (const nr of data.activeShift.nozzleReadings) {
      const opening = Number(nr.openingReading);
      const closing = closingReadings[nr.nozzleId] ?? opening;
      const volume = closing - opening;

      if (volume === 0) {
        zeroVolumeCount++;
      }
      if (volume > 5000) {
        warnings.push(`High volume alert: Nozzle ${nr.nozzleName} sold ${volume.toFixed(2)} Liters.`);
      }
    }

    if (zeroVolumeCount === data.activeShift.nozzleReadings.length) {
      warnings.push('Zero fuel volume was sold across all nozzles during this shift.');
    }

    // Check if all assigned attendants have recorded handovers
    const assignedStaff = data.activeShift.staffAssignments || [];
    for (const sa of assignedStaff) {
      const hasRecorded = handovers.some((h: any) => h.userId === sa.userId && h.duId === sa.duId);
      if (!hasRecorded) {
        warnings.push(`Handover not recorded for attendant ${sa.userName} on dispenser ${sa.duName || 'DU'}.`);
      }
    }

    // Mismatch check for credit chits vs customer bills
    const detailedCreditSum = shiftTotals.creditSales;
    if (hasHandovers && Math.abs(detailedCreditSum - totalCreditHandedOver) > 1.00) {
      warnings.push(`Credit Sales mismatch: Attendants declared ₹${totalCreditHandedOver.toLocaleString('en-IN')} in chits, but only ₹${detailedCreditSum.toLocaleString('en-IN')} of detailed customer billing has been logged in the transaction panel.`);
    }

    if (closingCash === 0 && expectedCash > 0) {
      warnings.push('Closing cash is ₹0, indicating no collections entered.');
    }
    if (Math.abs(cashVariance) > 100) {
      warnings.push(`Cash discrepancy detected! Variance is ₹${cashVariance.toLocaleString('en-IN')} (Expected: ₹${expectedCash.toLocaleString('en-IN')}, Entered: ₹${closingCash.toLocaleString('en-IN')})`);
    }
  }

  const triggerExpenseDrawer = () => {
    void openQuickEntryDrawer('expense');
  };

  const triggerCollectionDrawer = () => {
    void openQuickEntryDrawer('collection');
  };

  const triggerPurchaseDrawer = () => {
    void openQuickEntryDrawer('purchase');
  };

  const triggerMerchandiseSaleDrawer = () => {
    void openQuickEntryDrawer('merchandise-sale');
  };

  const quickEntryActions = [
    { key: 'expense', label: 'Add Expense', onClick: triggerExpenseDrawer, hotkey: 'E' },
    { key: 'collection', label: 'Log Collection', onClick: triggerCollectionDrawer, hotkey: 'C' },
    { key: 'merchandise-sale', label: 'Merchandise Sale', onClick: triggerMerchandiseSaleDrawer, hotkey: 'M' },
    { key: 'purchase', label: 'Add Purchase', onClick: triggerPurchaseDrawer, hotkey: 'P' },
  ];

  // Keyboard shortcuts (E/C/V/P) — active only on Today tab with an open shift and no other overlay focused.
  useEffect(() => {
    if (!data?.activeShift?.id) return;
    if (shiftSubTab !== 'today') return;
    if (viewingShiftSummary || viewHistoryShiftId) return;
    if (closeWizardOpen || quickEntryOpen || handoverDrawerOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      const k = e.key.toLowerCase();
      if (k === 'e') { e.preventDefault(); triggerExpenseDrawer(); }
      else if (k === 'c') { e.preventDefault(); triggerCollectionDrawer(); }
      else if (k === 'm') { e.preventDefault(); triggerMerchandiseSaleDrawer(); }
      else if (k === 'p') { e.preventDefault(); triggerPurchaseDrawer(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [data?.activeShift?.id, shiftSubTab, viewingShiftSummary, viewHistoryShiftId, closeWizardOpen, quickEntryOpen, handoverDrawerOpen]);

  const shiftOptions = [
    ...(data?.activeShift ? [{ id: data.activeShift.id, label: `Active: ${data.activeShift.templateName} (Open)` }] : []),
    ...recentClosedShifts.map((shift) => ({
      id: shift.id,
      label: `Closed: ${shift.templateName} (${new Date(shift.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})`,
    })),
  ];

  const handleExpenseSubmit = async (values: ExpenseEntryFormValues) => {
    const shiftId = values.targetShiftId || targetShiftId;
    if (!shiftId) {
      setQuickEntryError('A shift is required to record this entry.');
      return;
    }

    try {
      setQuickEntrySubmitting(true);
      setQuickEntryError(null);
      await transactionService.recordExpense({
        shiftId,
        categoryId: values.categoryId,
        amount: Number(values.amount),
        description: values.description || undefined,
      });
      closeQuickEntryDrawer();
      await loadShiftStatus();
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to record expense');
    } finally {
      setQuickEntrySubmitting(false);
    }
  };

  const handleCollectionSubmit = async (values: CollectionEntryFormValues) => {
    const shiftId = values.targetShiftId || targetShiftId;
    if (!shiftId) {
      setQuickEntryError('A shift is required to record this entry.');
      return;
    }

    try {
      setQuickEntrySubmitting(true);
      setQuickEntryError(null);
      await transactionService.recordCollection({
        shiftId,
        customerId: values.customerId || undefined,
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod,
        notes: values.notes || undefined,
      });
      closeQuickEntryDrawer();
      await loadShiftStatus();
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to record collection');
    } finally {
      setQuickEntrySubmitting(false);
    }
  };

  const handleMerchandiseSaleSubmit = async (values: MerchandiseSaleEntryFormValues) => {
    const shiftId = values.targetShiftId || targetShiftId;
    if (!shiftId) {
      setQuickEntryError('A shift is required to record this entry.');
      return;
    }
    const qtyNum = Number(values.quantity);
    const priceNum = Number(values.unitPrice);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isFinite(priceNum) || priceNum < 0) {
      setQuickEntryError('Enter a valid quantity and unit price.');
      return;
    }
    try {
      setQuickEntrySubmitting(true);
      setQuickEntryError(null);
      await transactionService.recordSale({
        shiftId,
        paymentMethod: values.paymentMethod,
        lines: [{ productId: values.productId, quantity: qtyNum, unitPrice: priceNum, tankId: null }],
        customerId: values.paymentMethod === 'Credit' ? values.customerId : undefined,
        attendantId: values.attendantId || undefined,
        notes: values.notes || undefined,
      });
      closeQuickEntryDrawer();
      await loadShiftStatus();
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to record merchandise sale');
    } finally {
      setQuickEntrySubmitting(false);
    }
  };

  const handlePurchaseSubmit = async (values: PurchaseEntryFormValues) => {
    const shiftId = values.targetShiftId || targetShiftId;
    if (!shiftId || !values.supplierId || values.lines.length === 0) {
      return;
    }

    try {
      setQuickEntrySubmitting(true);
      setQuickEntryError(null);

      await transactionService.recordPurchase({
        shiftId,
        supplierId: values.supplierId,
        invoiceNumber: values.invoiceNumber || undefined,
        notes: values.notes || undefined,
        lines: values.lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          tankAllocations: l.tankAllocations && l.tankAllocations.length > 0 ? l.tankAllocations : undefined,
        })),
      });
      closeQuickEntryDrawer();
      await loadShiftStatus();
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to record purchase');
    } finally {
      setQuickEntrySubmitting(false);
    }
  };


  // Initialise the open/close-form state whenever the cached shift status
  // changes (mount + after a mutation invalidates the cache).
  useEffect(() => {
    const statusData = statusQ.data;
    if (!statusData || !selectedStation) return;

    if (statusData.templates && statusData.templates.length > 0) {
      setSelectedTemplateId((prev: string) => prev || statusData.templates[0].id);
    }
    if (statusData.dispensers) {
      setStaffAssignments(
        statusData.dispensers.map((du: any) => ({ duId: du.id, userId: statusData.staff?.[0]?.id ?? '' })),
      );
    }
    if (statusData.terminals) {
      setTerminalAssignments(
        statusData.terminals.map((t: any) => ({ terminalId: t.id, duId: '' })),
      );
    }
    if (statusData.nozzles) {
      setInitialReadings(
        statusData.nozzles.map((nz: any) => ({ nozzleId: nz.id, openingReading: Number(nz.currentReading) })),
      );
      if (statusData.activeShift && statusData.activeShift.nozzleReadings) {
        const readingsMap: Record<string, number> = {};
        statusData.activeShift.nozzleReadings.forEach((nr: any) => {
          readingsMap[nr.nozzleId] = Number(nr.closingReading);
        });
        setClosingReadings(readingsMap);
        loadShiftTotals(statusData.activeShift.id);
        // Tank status for physical dip entry at close time.
        transactionService
          .getInventoryStatus(selectedStation.id)
          .then((tanksData) => {
            setStationTanks(tanksData || []);
            setDipReadings({});
          })
          .catch((tankErr) => console.error('Failed to load tanks for physical dip entry:', tankErr));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQ.data]);

  // Refreshing the shift workspace = invalidating the shared shift-status cache;
  // the query refetches and the init effect above re-runs.
  const loadShiftStatus = () => invalidateOperational(stationId);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      setIsOpening(true);
      const payload: any = {
        stationId: selectedStation.id,
        shiftTemplateId: selectedTemplateId,
        businessDate,
        openingCash,
        staffAssignments: staffAssignments.filter((a) => a.userId !== ''),
        terminalLinks: terminalAssignments.map((t) => ({ terminalId: t.terminalId, duId: t.duId || null })),
      };

      // If no last shift exists, send the manual override initial readings
      if (!data.lastShift) {
        payload.initialReadings = initialReadings;
      }

      await shiftService.openShift(payload);
      await loadShiftStatus();
    } catch (err: any) {
      alert(err.message || 'Failed to open shift');
    } finally {
      setIsOpening(false);
    }
  };

  const handleStaffAssignmentChange = (duId: string, userId: string) => {
    setStaffAssignments((prev) =>
      prev.map((a) => (a.duId === duId ? { ...a, userId } : a))
    );
  };

  const handleTerminalAssignmentChange = (terminalId: string, duId: string) => {
    setTerminalAssignments((prev) =>
      prev.map((t) => (t.terminalId === terminalId ? { ...t, duId } : t))
    );
  };

  const handleInitialReadingChange = (nozzleId: string, openingReading: number) => {
    setInitialReadings((prev) =>
      prev.map((r) => (r.nozzleId === nozzleId ? { ...r, openingReading } : r))
    );
  };

  const handleClosingReadingChange = (nozzleId: string, val: number) => {
    setClosingReadings((prev) => ({
      ...prev,
      [nozzleId]: val,
    }));
  };

  const handlePrepareClose = () => {
    if (!data.activeShift) return;

    // Perform validation checks
    for (const nr of data.activeShift.nozzleReadings) {
      const opening = Number(nr.openingReading);
      const closing = closingReadings[nr.nozzleId] ?? opening;

      if (closing < opening) {
        alert(`Error: Closing reading for nozzle ${nr.nozzleName} (${closing}) cannot be less than opening reading (${opening})`);
        return;
      }
    }

    setConfirmWarningsChecked(false);
    setIsPreparingClose(true);
    setCloseWizardOpen(true);
  };


  const handleCloseShift = async () => {
    if (!data.activeShift) return;
    try {
      setIsClosing(true);
      const readingsArray = Object.entries(closingReadings).map(([nozzleId, closingReading]) => ({
        nozzleId,
        closingReading,
      }));

      const dipReadingsArray = Object.entries(dipReadings)
        .filter(([_, actualQuantity]) => actualQuantity !== undefined && actualQuantity !== null && actualQuantity !== '')
        .map(([tankId, actualQuantity]) => ({
          tankId,
          actualQuantity: Number(actualQuantity),
        }));

      // Calculate expected, actual, variance and nextTemplateId before closing
      const expected = expectedCash;
      const actual = closingCash;
      const variance = cashVariance;
      const closedId = data.activeShift.id;

      let nextTemplateId = '';
      if (data?.templates && data.templates.length > 0 && data?.activeShift) {
        const currentIdx = data.templates.findIndex((t: any) => t.id === data.activeShift.shiftTemplateId);
        if (currentIdx !== -1) {
          nextTemplateId = data.templates[(currentIdx + 1) % data.templates.length].id;
        } else {
          nextTemplateId = data.templates[0].id;
        }
      }

      await shiftService.closeShift(data.activeShift.id, {
        closingCash,
        nozzleReadings: readingsArray,
        dipReadings: dipReadingsArray,
      });

      setIsPreparingClose(false);
      setCloseWizardOpen(false);
      await loadShiftStatus();

      setClosedShiftSuccess({
        expectedCash: expected,
        closingCash: actual,
        variance,
        lastClosedShiftId: closedId,
        nextTemplateId
      });
    } catch (err: any) {
      alert(err.message || 'Failed to close shift');
    } finally {
      setIsClosing(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to manage operational shifts.
      </div>
    );
  }

  if (loading) {
    return (
      <LoadingSpinner text="Resolving shift workspace states..." />
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)' }}>
        <strong>Error:</strong> {error.message || 'Failed to load shifts configuration'}
      </div>
    );
  }

  if (!data) {
    return <LoadingSpinner text="Resolving shift workspace states..." />;
  }

  const { activeShift, lastShift, lastDssr: lastShiftSummary, canReopenLastShift, gracePeriodExpiresAt, templates, nozzles, staff, dispensers, terminals } = data;
  const shiftScreenState: 'idle' | 'active' | 'closing' = activeShift
    ? (isPreparingClose ? 'closing' : 'active')
    : 'idle';

  const renderShiftSubTabs = () => (
    <Tabs
      aria-label="Shift views"
      className="no-print"
      activeId={shiftSubTab}
      onChange={(id) => setShiftSubTab(id as 'today' | 'planning' | 'history')}
      tabs={[
        {
          id: 'today',
          label: 'Today',
          icon: <Clock3 size={13} />,
          badge: activeShift ? (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '8px',
                background: 'var(--state-success-bg)',
                color: 'var(--state-success-fg)',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Open
            </span>
          ) : undefined,
        },
        { id: 'planning', label: 'Planning', icon: <CalendarRange size={13} /> },
        { id: 'history', label: 'History', icon: <History size={13} /> },
      ]}
    />
  );

  // Sub-tab: History
  if (shiftSubTab === 'history') {
    return (
      <div
        className="animate-fade-in"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-sans)' }}
      >
        {renderShiftSubTabs()}
        <ShiftHistoryTab
          selectedStation={selectedStation}
          userRole={userRole}
          viewShiftId={viewHistoryShiftId}
          onClearViewShiftId={() => setViewHistoryShiftId(null)}
        />
      </div>
    );
  }

  // Sub-tab: Planning (placeholder)
  if (shiftSubTab === 'planning') {
    return (
      <div
        className="animate-fade-in"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-sans)' }}
      >
        {renderShiftSubTabs()}
        <div
          className="card"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <CalendarRange size={32} style={{ color: 'var(--text-faint)' }} />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Shift Planning Coming Soon
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '420px' }}>
              Schedule upcoming shifts, assign attendant rosters and dispenser allocations, and pre-fill templates for the week ahead.
            </p>
          </div>
        </div>
      </div>
    );
  }


  // Render Success Screen if set
  if (closedShiftSuccess) {
    return (
      <ShiftCloseSuccess
        result={closedShiftSuccess}
        onStartNext={() => {
          setOpeningCash(closedShiftSuccess.closingCash);
          setSelectedTemplateId(closedShiftSuccess.nextTemplateId);
          setClosedShiftSuccess(null);
          setViewingShiftSummary(false);
        }}
        onViewSummary={() => {
          setViewHistoryShiftId(closedShiftSuccess.lastClosedShiftId);
          setShiftSubTab('history');
          setClosedShiftSuccess(null);
        }}
        onBack={() => {
          setClosedShiftSuccess(null);
          setViewingShiftSummary(false);
        }}
      />
    );
  }

  // Render Shift Summary View if toggled
  if (viewingShiftSummary && lastShiftSummary) {
    return (
      <ShiftSummaryView
        shiftSummary={lastShiftSummary}
        userRole={userRole}
        canReopen={canReopenLastShift}
        gracePeriodExpiresAt={gracePeriodExpiresAt}
        shiftStatus={lastShift?.status}
        station={selectedStation}
        onTransactionAdded={loadShiftStatus}
        onReopenSuccess={() => {
          setViewingShiftSummary(false);
          loadShiftStatus();
        }}
        onBack={() => setViewingShiftSummary(false)}
      />
    );
  }

  // Render Active Shift Workspace
  if (shiftScreenState === 'active' || shiftScreenState === 'closing') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-sans)' }}>
        {renderShiftSubTabs()}
        <ShiftControlBar
          activeShift={activeShift}
          shiftTotals={shiftTotals}
          handoversCompleted={handovers.length}
          handoversAssigned={activeShift.staffAssignments?.length || 0}
          quickActions={quickEntryActions}
          onCloseShiftClick={() => {
            if (isPreparingClose) {
              setCloseWizardOpen(true);
            } else {
              handlePrepareClose();
            }
          }}
          isPreparingClose={shiftScreenState === 'closing'}
          onViewLastShiftSummary={lastShiftSummary ? () => {
            setViewHistoryShiftId(lastShiftSummary.shiftId);
            setShiftSubTab('history');
          } : undefined}
        />

        {/* 1. Attendant Handovers Dashboard */}
        <AttendantHandoversDashboard
          staffAssignments={activeShift.staffAssignments}
          handovers={handovers}
          onRecordHandover={handleOpenHandoverDrawer}
        />

        {/* 2. Nozzle Readings Grid */}
        <NozzleReadingsGrid
          nozzleReadings={activeShift.nozzleReadings}
          closingReadings={closingReadings}
          staffAssignments={data?.activeShift?.staffAssignments || []}
        />

        {/* Shift Totals Summary Card */}
        <ShiftTotalsSummary
          shiftTotals={shiftTotals}
          cashCollections={activeCashCollections}
          cardCollections={activeCardCollections}
          upiCollections={activeUpiCollections}
          creditSales={activeCreditSales}
          handoverCount={handovers.length}
        />

        {/* Close Shift Wizard (Drawer) */}
        <CloseShiftWizard
          isOpen={closeWizardOpen}
          onClose={() => {
            setCloseWizardOpen(false);
            // Keep isPreparingClose=true so the control bar shows "Continue Close"
            // User cancels explicitly via the wizard's Cancel button only on step 1
            // and we only fully exit close mode if they haven't made progress.
            if (closingCash === 0 && Object.keys(dipReadings).length === 0) {
              setIsPreparingClose(false);
              setConfirmWarningsChecked(false);
            }
          }}
          shiftTemplateName={activeShift.templateName}
          openedAt={activeShift.openedAt}
          openingCash={openingCashNum}
          cashCollections={activeCashCollections}
          cashExpenses={shiftTotals.cashExpenses}
          expectedCash={expectedCash}
          closingCash={closingCash}
          onClosingCashChange={setClosingCash}
          stationTanks={stationTanks}
          dipReadings={dipReadings}
          onDipReadingsChange={setDipReadings}
          warnings={warnings}
          confirmWarningsChecked={confirmWarningsChecked}
          onConfirmWarningsChange={setConfirmWarningsChecked}
          isClosing={isClosing}
          onConfirmClose={() => handleCloseShift()}
        />

        {/* Quick Entry Drawer */}
        <QuickEntryDrawer
          isOpen={quickEntryOpen}
          onClose={closeQuickEntryDrawer}
          quickEntryType={quickEntryType}
          loading={quickEntryLoading}
          submitting={quickEntrySubmitting}
          error={quickEntryError}
          shiftOptions={shiftOptions}
          targetShiftId={targetShiftId}
          activeShiftTemplateName={data?.activeShift?.templateName}
          categories={categories}
          customers={customers}
          suppliers={suppliers}
          products={products}
          tanks={tanks}
          attendants={merchandiseSellers}
          stockByProduct={saleStock}
          expenseDefaults={expenseDefaults}
          collectionDefaults={collectionDefaults}
          purchaseDefaults={purchaseDefaults}
          merchandiseDefaults={merchandiseDefaults}
          onExpenseSubmit={handleExpenseSubmit}
          onCollectionSubmit={handleCollectionSubmit}
          onPurchaseSubmit={handlePurchaseSubmit}
          onMerchandiseSaleSubmit={handleMerchandiseSaleSubmit}
        />

        {selectedHandoverAssignment && (
          <HandoverDrawer
            isOpen={handoverDrawerOpen}
            onClose={() => {
              setHandoverDrawerOpen(false);
              setSelectedHandoverAssignment(null);
            }}
            shiftId={activeShift.id}
            userId={selectedHandoverAssignment.userId}
            userName={selectedHandoverAssignment.userName}
            duId={selectedHandoverAssignment.duId}
            duCode={selectedHandoverAssignment.duCode || selectedHandoverAssignment.duName}
            nozzles={activeShift.nozzleReadings.filter(
              (nr: any) => nr.duId === selectedHandoverAssignment.duId
            )}
            terminals={(activeShift.terminalLinks || []).filter(
              (t: any) => t.duId === selectedHandoverAssignment.duId || t.duId == null
            )}
            customers={handoverCreditCustomers}
            searchVehicles={(q: string) => transactionService.searchVehicles(q)}
            creditSales={
              (activeShift.staffAssignments || []).find(
                (sa: any) => sa.userId === selectedHandoverAssignment.userId && sa.duId === selectedHandoverAssignment.duId,
              )?.creditSales || selectedHandoverAssignment.creditSales || []
            }
            onCreditChanged={async () => {
              await loadShiftStatus();
            }}
            existingHandover={activeShift.handovers?.find(
              (h: any) => h.userId === selectedHandoverAssignment.userId && h.duId === selectedHandoverAssignment.duId
            )}
            onSaveSuccess={async () => {
              await loadShiftStatus();
            }}
          />
        )}
      </div>
    );
  }

  // Render Open Shift Form
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-sans)' }}>
      {renderShiftSubTabs()}
      <OpenShiftForm
        lastShiftSummary={lastShiftSummary}
        lastShift={lastShift}
        templates={templates}
        dispensers={dispensers}
        staff={staff}
        nozzles={nozzles}
        terminals={terminals}
        terminalAssignments={terminalAssignments}
        onTerminalAssignmentChange={handleTerminalAssignmentChange}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
        businessDate={businessDate}
        onBusinessDateChange={setBusinessDate}
        openingCash={openingCash}
        onOpeningCashChange={setOpeningCash}
        staffAssignments={staffAssignments}
        onStaffAssignmentChange={handleStaffAssignmentChange}
        initialReadings={initialReadings}
        onInitialReadingChange={handleInitialReadingChange}
        isOpening={isOpening}
        onSubmit={handleOpenShift}
        onViewLastShiftSummary={() => {
          setViewHistoryShiftId(lastShiftSummary.shiftId);
          setShiftSubTab('history');
        }}
      />
    </div>
  );
};
