import React, { useEffect, useMemo, useState } from 'react';
import { CloudProductService, CloudShiftService, CloudTankService, CloudTransactionService } from '../../services/cloud.js';
import { StatusBadge } from '../StatusBadge.js';
import { ShiftSummaryView } from './ShiftSummaryView.js';
import { ShiftTransactionsPanel } from './ShiftTransactionsPanel.js';
import { HandoverDrawer } from './HandoverDrawer.js';
import { Drawer } from '../Drawer.js';
import { ExpenseEntryForm } from '../transactions/ExpenseEntryForm.js';
import { CollectionEntryForm } from '../transactions/CollectionEntryForm.js';
import { PurchaseEntryForm } from '../transactions/PurchaseEntryForm.js';
import { Station } from '@pump/shared';
import { FileText, User, Save, Lock, AlertTriangle, Check, Fuel, Info, Play } from 'lucide-react';
import { LoadingSpinner } from '../LoadingSpinner.js';

const shiftService = new CloudShiftService();
const transactionService = new CloudTransactionService();
const productService = new CloudProductService();
const tankService = new CloudTankService();

type QuickEntryType = 'expense' | 'collection' | 'purchase';

interface ShiftsManagementProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  onNavigate?: (path: string) => void;
  onViewDssr?: (shiftId: string) => void;
}

export const ShiftsManagement: React.FC<ShiftsManagementProps> = ({
  selectedStation,
  userRole,
  userName,
  onNavigate,
  onViewDssr,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [viewingShiftSummary, setViewingShiftSummary] = useState(false);

  // Open Shift Form States
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [openingCash, setOpeningCash] = useState(0);
  const [staffAssignments, setStaffAssignments] = useState<{ userId: string; duId: string }[]>([]);
  const [initialReadings, setInitialReadings] = useState<{ nozzleId: string; openingReading: number }[]>([]);
  const [isOpening, setIsOpening] = useState(false);

  // Active Shift Workspace States
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});
  const [savingProgress, setSavingProgress] = useState(false);

  // Close Flow Inline States
  const [isPreparingClose, setIsPreparingClose] = useState(false);
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

  const handleOpenHandoverDrawer = (assignment: any) => {
    setSelectedHandoverAssignment(assignment);
    setHandoverDrawerOpen(true);
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

  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');

  const [collectionCustomerId, setCollectionCustomerId] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionPaymentMethod, setCollectionPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Credit'>('Cash');
  const [collectionNotes, setCollectionNotes] = useState('');

  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseProductId, setPurchaseProductId] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [purchaseTotalAmount, setPurchaseTotalAmount] = useState('');
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseAllocations, setPurchaseAllocations] = useState<Record<string, string>>({});

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === purchaseProductId),
    [products, purchaseProductId]
  );
  const isFuelPurchase = selectedProduct?.productType === 'FUEL';
  const purchaseProductTanks = useMemo(
    () => tanks.filter((tank) => tank.productId === purchaseProductId),
    [tanks, purchaseProductId]
  );

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
      
      const creditSales = txs.collections
        .filter((c: any) => c.paymentMethod === 'Credit')
        .reduce((sum: number, c: any) => sum + Number(c.amount), 0);

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
    setExpenseCategoryId(categories[0]?.id ?? '');
    setExpenseAmount('');
    setExpenseDescription('');

    setCollectionCustomerId(customers[0]?.id ?? '');
    setCollectionAmount('');
    setCollectionPaymentMethod('Cash');
    setCollectionNotes('');

    setPurchaseSupplierId(suppliers[0]?.id ?? '');
    setPurchaseProductId(products[0]?.id ?? '');
    setPurchaseQuantity('');
    setPurchaseTotalAmount('');
    setPurchaseInvoiceNumber('');
    setPurchaseNotes('');
    setPurchaseAllocations({});
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
        const expenseCategories = await transactionService.getExpenseCategories();
        setCategories(expenseCategories || []);
        setExpenseCategoryId(expenseCategories?.[0]?.id ?? '');
        setExpenseAmount('');
        setExpenseDescription('');
      }

      if (type === 'collection') {
        const activeCustomers = await transactionService.getCustomers(true);
        setCustomers(activeCustomers || []);
        setCollectionCustomerId(activeCustomers?.[0]?.id ?? '');
        setCollectionAmount('');
        setCollectionPaymentMethod('Cash');
        setCollectionNotes('');
      }

      if (type === 'purchase') {
        const [activeSuppliers, productList, tankList] = await Promise.all([
          transactionService.getSuppliers(true),
          productService.listProducts(),
          tankService.listTanks(selectedStation.id),
        ]);

        setSuppliers(activeSuppliers || []);
        setProducts(productList || []);
        setTanks(tankList || []);
        setPurchaseSupplierId(activeSuppliers?.[0]?.id ?? '');
        setPurchaseProductId(productList?.[0]?.id ?? '');
        setPurchaseQuantity('');
        setPurchaseTotalAmount('');
        setPurchaseInvoiceNumber('');
        setPurchaseNotes('');
        setPurchaseAllocations({});
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

  const quickEntryActions = [
    { key: 'expense', label: 'Add Expense', onClick: triggerExpenseDrawer },
    { key: 'collection', label: 'Log Collection', onClick: triggerCollectionDrawer },
    { key: 'purchase', label: 'Add Purchase', onClick: triggerPurchaseDrawer },
  ];

  const shiftOptions = [
    ...(data?.activeShift ? [{ id: data.activeShift.id, label: `Active: ${data.activeShift.templateName} (Open)` }] : []),
    ...recentClosedShifts.map((shift) => ({
      id: shift.id,
      label: `Closed: ${shift.templateName} (${new Date(shift.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})`,
    })),
  ];

  useEffect(() => {
    if (isFuelPurchase && purchaseProductTanks.length === 1 && purchaseQuantity) {
      setPurchaseAllocations({ [purchaseProductTanks[0].id]: purchaseQuantity });
      return;
    }

    if (!isFuelPurchase) {
      setPurchaseAllocations({});
    }
  }, [isFuelPurchase, purchaseProductId, purchaseQuantity, purchaseProductTanks.length]);

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetShiftId || !expenseCategoryId || !expenseAmount) {
      return;
    }

    try {
      setQuickEntrySubmitting(true);
      setQuickEntryError(null);
      await transactionService.recordExpense({
        shiftId: targetShiftId,
        categoryId: expenseCategoryId,
        amount: Number(expenseAmount),
        description: expenseDescription || undefined,
      });
      closeQuickEntryDrawer();
      await loadShiftStatus();
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to record expense');
    } finally {
      setQuickEntrySubmitting(false);
    }
  };

  const handleCollectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetShiftId || !collectionAmount) {
      return;
    }

    if (collectionPaymentMethod === 'Credit' && !collectionCustomerId) {
      setQuickEntryError('A customer account is required for Credit transactions.');
      return;
    }

    try {
      setQuickEntrySubmitting(true);
      setQuickEntryError(null);
      await transactionService.recordCollection({
        shiftId: targetShiftId,
        customerId: collectionCustomerId || undefined,
        amount: Number(collectionAmount),
        paymentMethod: collectionPaymentMethod,
        notes: collectionNotes || undefined,
      });
      closeQuickEntryDrawer();
      await loadShiftStatus();
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to record collection');
    } finally {
      setQuickEntrySubmitting(false);
    }
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetShiftId || !purchaseSupplierId || !purchaseProductId || !purchaseQuantity || !purchaseTotalAmount) {
      return;
    }

    try {
      setQuickEntrySubmitting(true);
      setQuickEntryError(null);

      const qtyNum = Number(purchaseQuantity);
      const totalAmtNum = Number(purchaseTotalAmount);
      const computedUnitPrice = qtyNum > 0 ? parseFloat((totalAmtNum / qtyNum).toFixed(6)) : 0;

      let tankAllocations: { tankId: string; quantity: number }[] = [];
      if (isFuelPurchase && purchaseProductTanks.length > 0) {
        let totalAllocated = 0;
        for (const tank of purchaseProductTanks) {
          const qty = Number(purchaseAllocations[tank.id] || 0);
          if (qty > 0) {
            tankAllocations.push({ tankId: tank.id, quantity: qty });
            totalAllocated += qty;
          }
        }

        if (Math.abs(totalAllocated - qtyNum) >= 0.01) {
          setQuickEntryError(`Total allocated volume (${totalAllocated.toFixed(2)}L) must match invoice quantity (${qtyNum.toFixed(2)}L).`);
          setQuickEntrySubmitting(false);
          return;
        }
      }

      await transactionService.recordPurchase({
        shiftId: targetShiftId,
        supplierId: purchaseSupplierId,
        productId: purchaseProductId,
        quantity: qtyNum,
        unitPrice: computedUnitPrice,
        invoiceNumber: purchaseInvoiceNumber || undefined,
        notes: purchaseNotes || undefined,
        tankAllocations: tankAllocations.length > 0 ? tankAllocations : undefined,
      });
      closeQuickEntryDrawer();
      await loadShiftStatus();
    } catch (err: any) {
      setQuickEntryError(err.message || 'Failed to record purchase');
    } finally {
      setQuickEntrySubmitting(false);
    }
  };


  useEffect(() => {
    if (selectedStation) {
      loadShiftStatus();
    }
  }, [selectedStation]);

  const loadShiftStatus = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      setError(null);
      const statusData = await shiftService.getShiftStatus(selectedStation.id);
      setData(statusData);

      // Pre-select first template
      if (statusData.templates && statusData.templates.length > 0) {
        setSelectedTemplateId(statusData.templates[0].id);
      }

      // Initialize assignments list based on dispensers
      if (statusData.dispensers) {
        setStaffAssignments(
          statusData.dispensers.map((du: any) => ({
            duId: du.id,
            userId: statusData.staff[0]?.id ?? '',
          }))
        );
      }

      // Initialize manual readings fallbacks
      if (statusData.nozzles) {
        setInitialReadings(
          statusData.nozzles.map((nz: any) => ({
            nozzleId: nz.id,
            openingReading: Number(nz.currentReading),
          }))
        );

        // Populate active closing readings state if shift is open
        if (statusData.activeShift && statusData.activeShift.nozzleReadings) {
          const readingsMap: Record<string, number> = {};
          statusData.activeShift.nozzleReadings.forEach((nr: any) => {
            readingsMap[nr.nozzleId] = Number(nr.closingReading);
          });
          setClosingReadings(readingsMap);
          loadShiftTotals(statusData.activeShift.id);

          // Fetch tank status for physical dip entry at close time
          try {
            const txService = new CloudTransactionService();
            const tanksData = await txService.getInventoryStatus(selectedStation.id);
            setStationTanks(tanksData || []);
            setDipReadings({});
          } catch (tankErr) {
            console.error('Failed to load tanks for physical dip entry:', tankErr);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load shifts configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      setIsOpening(true);
      const payload: any = {
        stationId: selectedStation.id,
        shiftTemplateId: selectedTemplateId,
        openingCash,
        staffAssignments: staffAssignments.filter((a) => a.userId !== ''),
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

  const handleSaveProgress = async () => {
    if (!data.activeShift) return;
    try {
      setSavingProgress(true);
      const readingsArray = Object.entries(closingReadings).map(([nozzleId, closingReading]) => ({
        nozzleId,
        closingReading,
      }));
      await shiftService.updateNozzleReadings(data.activeShift.id, readingsArray);
      alert('Readings progress saved successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to save progress');
    } finally {
      setSavingProgress(false);
    }
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
  };


  const handleCloseShift = async (startNextShiftImmediately = false) => {
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
      await loadShiftStatus();

      if (startNextShiftImmediately) {
        setOpeningCash(actual);
        if (nextTemplateId) {
          setSelectedTemplateId(nextTemplateId);
        }
        setViewingShiftSummary(false);
        setClosedShiftSuccess(null);
      } else {
        setClosedShiftSuccess({
          expectedCash: expected,
          closingCash: actual,
          variance,
          lastClosedShiftId: closedId,
          nextTemplateId
        });
      }
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
        <strong>Error:</strong> {error}
      </div>
    );
  }

  const { activeShift, lastShift, lastDssr: lastShiftSummary, canReopenLastShift, gracePeriodExpiresAt, templates, nozzles, staff, dispensers } = data;

  // Render Success Screen if set
  if (closedShiftSuccess) {
    return (
      <div className="animate-fade-in card card-comfortable" style={{ maxWidth: '600px', margin: '40px auto', display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            color: 'var(--state-success-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Check size={36} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)' }}>Shift Closed Successfully</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>The Daily Sales Summary Record (DSSR) snapshot has been compiled and saved permanently.</p>
        </div>

        <div style={{
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-input)',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '13px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-surface-alt)',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', alignSelf: 'stretch', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
            <span>Expected Safe Cash</span>
            <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{closedShiftSuccess.expectedCash.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', alignSelf: 'stretch', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
            <span>Actual Closing Cash Entered</span>
            <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{closedShiftSuccess.closingCash.toLocaleString('en-IN')}</span>
          </div>
          <div style={{
            display: 'flex',
            alignSelf: 'stretch',
            justifyContent: 'space-between',
            padding: '12px 16px',
            fontWeight: 700,
            color: closedShiftSuccess.variance === 0 ? 'var(--state-success-fg)' : 'var(--brand-danger)'
          }}>
            <span>Cash Variance</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {closedShiftSuccess.variance > 0 ? '+' : ''}₹{closedShiftSuccess.variance.toLocaleString('en-IN')}
              {closedShiftSuccess.variance === 0 ? ' (Perfect Match)' : ''}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            className="btn btn-primary btn-md"
            onClick={() => {
              setOpeningCash(closedShiftSuccess.closingCash);
              setSelectedTemplateId(closedShiftSuccess.nextTemplateId);
              setClosedShiftSuccess(null);
              setViewingShiftSummary(false);
            }}
          >
            <Play size={13} style={{ fill: 'currentColor', marginRight: '6px' }} /> Start Next Shift
          </button>
          
          <button
            className="btn btn-secondary btn-md"
            onClick={() => {
              if (onNavigate && onViewDssr) {
                onViewDssr(closedShiftSuccess.lastClosedShiftId);
                onNavigate('/reports');
              } else {
                setViewingShiftSummary(true);
              }
              setClosedShiftSuccess(null);
            }}
          >
            <FileText size={13} style={{ marginRight: '6px' }} /> View Compiled Shift Summary
          </button>

          <button
            className="btn btn-secondary btn-md"
            onClick={() => {
              setClosedShiftSuccess(null);
              setViewingShiftSummary(false);
            }}
          >
            Back to Workspace
          </button>
        </div>
      </div>
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
  if (activeShift) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
        {/* Workspace Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                Active Shift Workspace
              </h1>
              <StatusBadge status="OPEN" type="success" />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
              Template: <strong>{activeShift.templateName}</strong> • Opened by {activeShift.openedByName} at {new Date(activeShift.openedAt).toLocaleString()}
            </p>
          </div>
          {lastShiftSummary && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (onNavigate && onViewDssr) {
                  onViewDssr(lastShiftSummary.shiftId);
                  onNavigate('/reports');
                } else {
                  setViewingShiftSummary(true);
                }
              }}
            >
              <FileText size={13} /> View Last Shift Summary
            </button>
          )}
        </div>

        {/* 1. Attendant Handovers Dashboard */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
                Attendant Handovers Dashboard
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Record dispenser nozzle closing readings, cash, card, UPI collections and credit chits per assigned attendant.
              </p>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Attendant</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Dispenser</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Handover Status</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Cash (₹)</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Card/UPI (₹)</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Credit Chits (₹)</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Expected Sales (₹)</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Variance (₹)</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeShift.staffAssignments && activeShift.staffAssignments.length > 0 ? (
                activeShift.staffAssignments.map((sa: any, idx: number) => {
                  const handoverRecord = handovers.find(
                    (h: any) => h.userId === sa.userId && h.duId === sa.duId
                  );
                  const isRecorded = !!handoverRecord;

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                        {sa.userName}
                      </td>
                      <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                        {sa.duCode || sa.duName}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <StatusBadge
                          status={isRecorded ? 'RECORDED' : 'PENDING'}
                          type={isRecorded ? 'success' : 'warning'}
                        />
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {isRecorded ? `₹${Number(handoverRecord.cashHandedOver).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {isRecorded ? `₹${(Number(handoverRecord.cardHandedOver) + Number(handoverRecord.upiHandedOver)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {isRecorded ? `₹${Number(handoverRecord.creditHandedOver).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {isRecorded ? `₹${Number(handoverRecord.expectedSales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{
                        padding: '12px 20px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: !isRecorded ? 'var(--text-default)' : Number(handoverRecord.varianceAmount) === 0 ? 'var(--state-success-fg)' : Number(handoverRecord.varianceAmount) > 0 ? 'var(--brand-warning)' : 'var(--brand-danger)'
                      }}>
                        {isRecorded ? (
                          <>
                            {Number(handoverRecord.varianceAmount) > 0 ? '+' : ''}
                            ₹{Number(handoverRecord.varianceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 20px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className={isRecorded ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}
                          onClick={() => handleOpenHandoverDrawer(sa)}
                        >
                          {isRecorded ? 'Edit Handover' : 'Record Handover'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No staff assignments found for this active shift. Assign staff dispensers in the setup to record handovers.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 2. Nozzle Readings Grid */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
                Nozzle Readings Grid
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Summary of nozzle closing readings and volume sold compiled from recorded attendant handovers.
              </p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Nozzle</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Dispenser</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Staff</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Product</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Tank</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Price</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Opening Rd</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Closing Rd</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Volume Sold</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Sales Value</th>
              </tr>
            </thead>
            <tbody>
              {activeShift.nozzleReadings.map((nr: any, idx: number) => {
                const opening = Number(nr.openingReading);
                const closing = closingReadings[nr.nozzleId] ?? opening;
                const volume = closing - opening;
                const price = Number(nr.unitPrice || 0);
                const value = volume * price;

                const assignment = data?.activeShift?.staffAssignments?.find(
                  (sa: any) => sa.duId === nr.duId
                );
                const assignedStaffName = assignment ? assignment.userName : 'Unassigned';

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>{nr.nozzleName}</td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>{nr.duCode || nr.duName || 'N/A'}</td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                      <span style={{ 
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: assignedStaffName === 'Unassigned' ? 'var(--bg-surface-alt)' : 'rgba(16, 185, 129, 0.08)',
                        color: assignedStaffName === 'Unassigned' ? 'var(--text-muted)' : '#059669',
                        fontWeight: 600
                      }}>
                        {assignedStaffName}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>{nr.productName} ({nr.productCode})</td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>{nr.tankName}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ₹{price.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {opening.toFixed(3)}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                      {closing.toFixed(3)}
                    </td>
                    <td style={{
                      padding: '12px 20px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: volume < 0 ? 'var(--state-danger-fg)' : 'var(--text-strong)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {volume.toFixed(3)} L
                    </td>
                    <td style={{
                      padding: '12px 20px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Shift Totals Summary Card */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-card)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginTop: '8px',
          marginBottom: '8px'
        }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Operational Summary (Current Shift)
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Real-time summary of transactions logged via sidebar modules for this active shift.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '16px'
          }}>
            <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Petty Expenses</span>
              <strong style={{ fontSize: '15px', color: 'var(--brand-danger)', fontFamily: 'var(--font-mono)' }}>
                ₹{shiftTotals.cashExpenses.toLocaleString('en-IN')}
              </strong>
              <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
                {shiftTotals.expenseCount} items recorded
              </span>
            </div>

            <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Cash Handed Over</span>
              <strong style={{ fontSize: '15px', color: 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
                ₹{activeCashCollections.toLocaleString('en-IN')}
              </strong>
              <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
                {handovers.length} handovers received
              </span>
            </div>

            <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Card & UPI Handover</span>
              <strong style={{ fontSize: '15px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                ₹{(activeCardCollections + activeUpiCollections).toLocaleString('en-IN')}
              </strong>
              <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
                Card: ₹{activeCardCollections.toLocaleString('en-IN')} • UPI: ₹{activeUpiCollections.toLocaleString('en-IN')}
              </span>
            </div>

            <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Credit Fleet Chits</span>
              <strong style={{ fontSize: '15px', color: 'var(--brand-warning)', fontFamily: 'var(--font-mono)' }}>
                ₹{activeCreditSales.toLocaleString('en-IN')}
              </strong>
              <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
                Logged Bills: ₹{shiftTotals.creditSales.toLocaleString('en-IN')}
              </span>
            </div>

            <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Supplier Purchases</span>
              <strong style={{ fontSize: '15px', color: 'var(--brand-secondary)', fontFamily: 'var(--font-mono)' }}>
                ₹{shiftTotals.purchaseTotal.toLocaleString('en-IN')}
              </strong>
              <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
                {shiftTotals.purchaseCount} drops recorded
              </span>
            </div>
          </div>
        </div>

        {/* Save / Close Shift Inline Cards */}
        {!isPreparingClose ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              className="btn btn-primary btn-md"
              onClick={handlePrepareClose}
            >
              <Lock size={13} style={{ marginRight: '6px' }} /> Close Shift & Compile DSSR
            </button>
          </div>
        ) : (
          <div className="card card-default animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderColor: 'var(--border-strong)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Reconciliation Review
            </h3>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '14px 16px',
              backgroundColor: 'var(--state-info-bg)',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--border-soft)'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--state-info-fg)' }}>
                Quick Reconciliation Actions
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {quickEntryActions.map((action) => (
                  <button
                    key={action.key}
                    className="btn btn-secondary btn-sm"
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--state-info-fg)' }}>
                Actions open as global quick-entry drawers while you stay on this shift screen.
              </span>
            </div>

            {/* Expected Safe Cash Calculations Card */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '16px',
              backgroundColor: 'var(--bg-surface-alt)',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--border-soft)'
            }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Financial Reconciliation Checklist</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Opening Cash Float:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{openingCashNum.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--state-success-fg)' }}>
                <span>(+) Cash Handed Over (Attendants):</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>+ ₹{activeCashCollections.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--brand-danger)' }}>
                <span>(-) Petty Cash Expenses:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>- ₹{shiftTotals.cashExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, borderTop: '1px solid var(--border-strong)', paddingTop: '8px', marginTop: '4px', color: 'var(--text-strong)' }}>
                <span>Expected Safe Cash:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{expectedCash.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
                1. Enter Physical Counted Safe Cash (Float + Deposited Cash):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="number"
                  value={closingCash}
                  onChange={(e) => setClosingCash(Number(e.target.value))}
                  style={{
                    width: '200px',
                    height: '32px',
                    padding: '0 12px',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-input)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px'
                  }}
                />
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: cashVariance === 0 ? 'var(--state-success-fg)' : 'var(--brand-danger)'
                }}>
                  Variance: {cashVariance > 0 ? '+' : ''}₹{cashVariance.toLocaleString('en-IN')}
                  {cashVariance === 0 ? ' (Perfect Match)' : cashVariance > 0 ? ' (Cash Surplus)' : ' (Cash Shortage)'}
                </span>
              </div>
            </div>

            {stationTanks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px', marginTop: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
                  2. Enter Physical Dip Readings (Actual Stock level in Liters):
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {stationTanks.map((tank) => (
                    <div
                      key={tank.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'var(--bg-canvas)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-soft)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>
                          {tank.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Product: {tank.productName} • Expected Stock: <strong>{tank.currentVolume.toFixed(1)} L</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Optional (L)"
                          value={dipReadings[tank.id] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDipReadings({
                              ...dipReadings,
                              [tank.id]: val === '' ? '' : Number(val)
                            });
                          }}
                          style={{
                            width: '120px',
                            height: '32px',
                            padding: '0 8px',
                            border: '1px solid var(--border-strong)',
                            borderRadius: 'var(--radius-input)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            textAlign: 'right',
                          }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Liters</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {warnings.length > 0 && (
              <div style={{
                backgroundColor: 'var(--state-warning-bg)',
                color: 'var(--state-warning-fg)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                border: '1px solid var(--border-soft)'
              }}>
                <span style={{ fontWeight: 700 }}>
                  <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> Shift Warning Indicators Raised:
                </span>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                  {warnings.map((w, idx) => (
                    <li key={idx} style={{ marginTop: '3px' }}>{w}</li>
                  ))}
                </ul>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="confirm_warn"
                    checked={confirmWarningsChecked}
                    onChange={(e) => setConfirmWarningsChecked(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="confirm_warn" style={{ fontWeight: 600, cursor: 'pointer' }}>
                    I explicitly confirm that these readings are correct and wish to proceed anyway.
                  </label>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                className={`btn ${(warnings.length === 0 || confirmWarningsChecked) ? 'btn-primary' : 'btn-secondary'} btn-md`}
                onClick={() => handleCloseShift(false)}
                disabled={(warnings.length > 0 && !confirmWarningsChecked) || isClosing}
              >
                {isClosing ? 'Saving Shift Summary...' : (
                  <>
                    <Check size={13} style={{ marginRight: '6px' }} /> Confirm Close Shift
                  </>
                )}
              </button>

              <button
                className="btn btn-secondary btn-md"
                onClick={() => handleCloseShift(true)}
                disabled={(warnings.length > 0 && !confirmWarningsChecked) || isClosing}
              >
                Close & Start Next Shift
              </button>

              <button
                className="btn btn-secondary btn-md"
                onClick={() => setIsPreparingClose(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Handover Drawer Overlay */}
        <Drawer
          isOpen={quickEntryOpen}
          onClose={closeQuickEntryDrawer}
          title={quickEntryType === 'expense' ? 'Quick Add Expense' : quickEntryType === 'collection' ? 'Quick Log Collection' : 'Quick Add Purchase'}
        >
          {quickEntryLoading ? (
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
                  onTargetShiftIdChange={setTargetShiftId}
                  categoryId={expenseCategoryId}
                  onCategoryIdChange={setExpenseCategoryId}
                  categories={categories}
                  amount={expenseAmount}
                  onAmountChange={setExpenseAmount}
                  description={expenseDescription}
                  onDescriptionChange={setExpenseDescription}
                  submitting={quickEntrySubmitting}
                  error={quickEntryError}
                  onCancel={closeQuickEntryDrawer}
                  onSubmit={handleExpenseSubmit}
                  submitLabel="Add Expense"
                />
              )}

              {quickEntryType === 'collection' && (
                <CollectionEntryForm
                  shiftOptions={shiftOptions}
                  targetShiftId={targetShiftId}
                  onTargetShiftIdChange={setTargetShiftId}
                  customerId={collectionCustomerId}
                  onCustomerIdChange={setCollectionCustomerId}
                  customers={customers}
                  amount={collectionAmount}
                  onAmountChange={setCollectionAmount}
                  paymentMethod={collectionPaymentMethod}
                  onPaymentMethodChange={setCollectionPaymentMethod}
                  notes={collectionNotes}
                  onNotesChange={setCollectionNotes}
                  submitting={quickEntrySubmitting}
                  error={quickEntryError}
                  onCancel={closeQuickEntryDrawer}
                  onSubmit={handleCollectionSubmit}
                  submitLabel={collectionPaymentMethod === 'Credit' ? 'Log Credit Sale' : 'Log Collection'}
                  submittingLabel="Recording..."
                  submitDisabled={quickEntrySubmitting || !collectionAmount}
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
                  targetShiftId={targetShiftId}
                  onTargetShiftIdChange={setTargetShiftId}
                  supplierId={purchaseSupplierId}
                  onSupplierIdChange={setPurchaseSupplierId}
                  suppliers={suppliers}
                  productId={purchaseProductId}
                  onProductIdChange={setPurchaseProductId}
                  products={products}
                  quantity={purchaseQuantity}
                  onQuantityChange={setPurchaseQuantity}
                  totalAmount={purchaseTotalAmount}
                  onTotalAmountChange={setPurchaseTotalAmount}
                  invoiceNumber={purchaseInvoiceNumber}
                  onInvoiceNumberChange={setPurchaseInvoiceNumber}
                  notes={purchaseNotes}
                  onNotesChange={setPurchaseNotes}
                  isFuel={isFuelPurchase}
                  productTanks={purchaseProductTanks}
                  allocations={purchaseAllocations}
                  onAllocationsChange={setPurchaseAllocations}
                  submitting={quickEntrySubmitting}
                  error={quickEntryError}
                  onCancel={closeQuickEntryDrawer}
                  onSubmit={handlePurchaseSubmit}
                  submitLabel="Add Purchase"
                />
              )}
            </>
          )}
        </Drawer>

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
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      {/* Workspace Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            No Active Operational Shift
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Open a shift template to enable nozzle readings entry and daily cash reconciliation.
          </p>
        </div>
        {lastShiftSummary && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (onNavigate && onViewDssr) {
                onViewDssr(lastShiftSummary.shiftId);
                onNavigate('/reports');
              } else {
                setViewingShiftSummary(true);
              }
            }}
          >
            <FileText size={13} /> View Last Shift Summary
          </button>
        )}
      </div>

      {/* Main Open Shift Form */}
      <form onSubmit={handleOpenShift} className="card card-default" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Shift details row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
              Select Shift Template:
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              required
              style={{
                height: '32px',
                padding: '0 10px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                fontSize: '13px',
                color: 'var(--text-strong)',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              {templates && templates.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.startTime} - {t.endTime})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-default)' }}>
              Opening Cash Float Amount (₹):
            </label>
            <input
              type="number"
              value={openingCash}
              onChange={(e) => setOpeningCash(Number(e.target.value))}
              required
              style={{
                height: '30px',
                padding: '0 10px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px'
              }}
            />
          </div>
        </div>

        {/* Optional Staff Assignment sub-form */}
        {dispensers && dispensers.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Staff Assignment to Dispenser Units (Optional)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              {dispensers.map((du: any) => {
                const assigned = staffAssignments.find((a) => a.duId === du.id);
                return (
                  <div key={du.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-default)' }}>
                      <Fuel size={13} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> Dispenser <strong>{du.name}</strong>
                    </span>
                    <select
                      value={assigned?.userId ?? ''}
                      onChange={(e) => handleStaffAssignmentChange(du.id, e.target.value)}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-input)',
                        fontSize: '12px',
                        color: 'var(--text-strong)'
                      }}
                    >
                      <option value="">-- Unassigned --</option>
                      {staff && staff.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} {!u.email ? ' (Attendant)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual Nozzle Readings override only for first-time / no-history runs */}
        {!lastShift && nozzles && nozzles.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{
              backgroundColor: 'var(--bg-surface-alt)',
              padding: '12px',
              borderRadius: 'var(--radius-input)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-soft)'
            }}>
              <Info size={14} style={{ color: 'var(--brand-primary)', marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> <strong>First Operational Shift:</strong> Since there is no previous shift history for this station, please specify the initial opening readings for all nozzles.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {nozzles.map((nz: any) => {
                const initial = initialReadings.find((r) => r.nozzleId === nz.id);
                return (
                  <div key={nz.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-default)' }}>
                      Nozzle {nz.name} ({nz.productCode})
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={initial?.openingReading ?? 0}
                      onChange={(e) => handleInitialReadingChange(nz.id, Number(e.target.value))}
                      style={{
                        height: '26px',
                        padding: '0 8px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-input)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn btn-primary btn-md"
            disabled={isOpening}
          >
            {isOpening ? 'Opening Shift...' : (
              <>
                <Play size={13} style={{ fill: 'currentColor', marginRight: '6px' }} /> Start Shift Operations
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
