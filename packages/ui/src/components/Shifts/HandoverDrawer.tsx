import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Drawer } from '../Drawer.js';
import { Button, Form, Icon } from '../../pump-ds/index.js';
import { Combobox } from '../primitives/Combobox.js';
import { CashCountPopover, type CashBreakdown } from '../primitives/CashCountPopover.js';
import { CustomerFormDrawer } from '../customers/CustomerFormDrawer.js';
import { VehicleDrawer } from '../customers/VehicleDrawer.js';
import { useAllVehicles } from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';
import {
  CloudTransactionService,
  type RecordHandoverPayload,
  type RecordHandoverResult,
} from '../../services/cloud.js';
import {
  loadHandoverRequestIdentity,
  resolveHandoverRequestIdentity,
  saveHandoverRequestIdentity,
  useRecordHandoverMutation,
} from '../../query/handoverMutation.js';
import { inr } from '../../utils/format.js';
import { useRunTask } from '../../utils/runTask.js';

const transactionService = new CloudTransactionService();

// Sentinel option values for the "＋ New …" inline-create entries in the picker.
const NEW_CUSTOMER = '__new_customer__';
const NEW_VEHICLE = '__new_vehicle__';

// A fresh idempotency key per customer-sale line, so a retry of the SAME line
// (e.g. after a network blip) de-dupes server-side instead of double-posting.
const genIdemKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Define form validation schema using Zod
const handoverFormSchema = z.object({
  cashHandedOver: z.coerce.number().nonnegative('Cash must be non-negative'),
  cardHandedOver: z.coerce.number().nonnegative('Card Swipe total must be non-negative'),
  upiHandedOver: z.coerce.number().nonnegative('UPI QR total must be non-negative'),
  nozzleReadings: z.record(
    z.string().uuid(),
    z.coerce.number().nonnegative('Reading must be non-negative'),
  ),
  nozzleTesting: z.record(
    z.string().uuid(),
    z.coerce.number().nonnegative('Testing quantity must be non-negative'),
  ),
  terminalCard: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
  terminalUpi: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
});

type HandoverFormValues = z.infer<typeof handoverFormSchema>;

interface HandoverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  shiftId: string;
  stationId: string | null;
  userId: string;
  userName: string;
  duId: string;
  duCode: string;
  nozzles: any[];
  terminals?: any[];
  stationHasConfiguredTerminals?: boolean;
  /** Credit-eligible (non-prepaid Credit/Fleet) customers, each with currentBalance + creditLimit. */
  customers?: any[];
  /** Fuel-on-credit lines already recorded for this (attendant, DU). */
  creditSales?: any[];
  /** OMC fleet-card sale lines already recorded for this (attendant, DU). */
  omcSales?: any[];
  /** Walk-in merchandise cash this attendant collected (folds into expected). */
  merchandiseCash?: number;
  /** Walk-in merchandise paid by card/UPI on a terminal (informational; not in cash expected). */
  merchandiseNonCash?: number;
  /** Called after a credit line is added/voided so the parent can refetch status. */
  onCreditChanged?: () => void | Promise<void>;
  existingHandover: any;
  onSaveSuccess: () => void;
}

/**
 * The body only exists while the drawer is open, so everything it prefills from
 * props is an initial value rather than something an effect has to push in and
 * then defend with a latch. The latch existed because recording a credit sale
 * calls `onCreditChanged()`, which refetches and hands back fresh `nozzles` /
 * `terminals` / `existingHandover` identities mid-entry; unmounting on close
 * expresses "once per open" directly, so the refetch is simply not a re-open.
 */
export const HandoverDrawer: React.FC<HandoverDrawerProps> = (props) =>
  props.isOpen ? <HandoverDrawerBody {...props} /> : null;

const HandoverDrawerBody: React.FC<HandoverDrawerProps> = ({
  onClose,
  shiftId,
  stationId,
  userId,
  userName,
  duId,
  duCode,
  nozzles,
  terminals = [],
  stationHasConfiguredTerminals = false,
  customers = [],
  creditSales = [],
  omcSales = [],
  merchandiseCash = 0,
  merchandiseNonCash = 0,
  onCreditChanged,
  existingHandover,
  onSaveSuccess,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guard against a forgotten POS sheet: terminals configured but zero card/UPI
  // declared needs one explicit confirmation before submit.
  const [zeroTerminalsConfirmed, setZeroTerminalsConfirmed] = useState(false);
  const [acceptedResult, setAcceptedResult] = useState<RecordHandoverResult | null>(null);
  const toast = useToast();
  // Lazily, once per open: a bare useRef argument is evaluated on every render,
  // which would re-read localStorage on every keystroke in this drawer.
  const [initialHandoverRequest] = useState(() =>
    stationId ? loadHandoverRequestIdentity(stationId, shiftId, userId, duId) : null,
  );
  const handoverRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(
    initialHandoverRequest,
  );
  const recordHandover = useRecordHandoverMutation();
  // Denomination counts for the handover cash (held here so re-opening the
  // popover preserves them). Reset when the drawer opens.
  const [cashBreakdown, setCashBreakdown] = useState<CashBreakdown>({});
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<HandoverFormValues>({
    resolver: zodResolver(handoverFormSchema),
    // Built once on open. Closing readings start from the opening reading as a
    // helpful anchor, and testing pre-fills from the previously-saved value so
    // re-saving a handover cannot silently zero a calibration volume.
    defaultValues: (() => {
      const existingEntries: any[] = existingHandover?.terminalEntries ?? [];
      const nozzleReadings: Record<string, number> = {};
      const nozzleTesting: Record<string, any> = {};
      for (const nz of nozzles) {
        nozzleReadings[nz.nozzleId] = Number(nz.closingReading ?? nz.openingReading ?? 0);
        nozzleTesting[nz.nozzleId] = (Number(nz.testingVolume) || '') as any;
      }
      const terminalCard: Record<string, any> = {};
      const terminalUpi: Record<string, any> = {};
      for (const t of terminals.filter((x: any) => x.duId === duId)) {
        const prior = existingEntries.find((e) => e.terminalId === t.terminalId);
        terminalCard[t.terminalId] = (Number(prior?.cardAmount) || '') as any;
        terminalUpi[t.terminalId] = (Number(prior?.upiAmount) || '') as any;
      }
      return {
        cashHandedOver: (Number(existingHandover?.cashHandedOver) || '') as any,
        cardHandedOver: (Number(existingHandover?.cardHandedOver) || '') as any,
        upiHandedOver: (Number(existingHandover?.upiHandedOver) || '') as any,
        nozzleReadings,
        nozzleTesting,
        terminalCard,
        terminalUpi,
      };
    })(),
  });
  const acceptedFormFingerprintRef = useRef<string | null>(null);

  // Pre-fill form if existing handover is passed.
  //
  // This must run only ONCE per drawer open. Recording an in-drawer credit sale
  // calls onCreditChanged(), which makes the parent refetch shift status and pass
  // fresh `nozzles`/`terminals`/`existingHandover` identities. Without this guard
  // the effect would re-run on that refetch and overwrite the operator's
  // in-progress nozzle/POS/cash entries.

  // Watch form values reactively for live expected sales and variance computations
  const formValues = watch();
  useEffect(() => {
    if (acceptedResult && acceptedFormFingerprintRef.current !== JSON.stringify(formValues)) {
      setAcceptedResult(null);
    }
  }, [acceptedResult, formValues]);
  const formNozzleReadings = formValues.nozzleReadings || {};
  const formNozzleTesting = formValues.nozzleTesting || {};
  const formCash = formValues.cashHandedOver || 0;

  // POS terminals assigned to THIS DU (shift-wide / other-DU machines are not
  // shown to the attendant). When present, card/UPI aggregates are derived from
  // the per-terminal batches (single source of truth).
  const duTerminals = terminals.filter((t: any) => t.duId === duId);
  const hasTerminals = duTerminals.length > 0;
  const formTerminalCard = formValues.terminalCard || {};
  const formTerminalUpi = formValues.terminalUpi || {};
  const terminalCardTotal = duTerminals.reduce(
    (sum: number, t: any) => sum + Number(formTerminalCard[t.terminalId] || 0),
    0,
  );
  const terminalUpiTotal = duTerminals.reduce(
    (sum: number, t: any) => sum + Number(formTerminalUpi[t.terminalId] || 0),
    0,
  );
  const aggregateAllowed = !stationHasConfiguredTerminals;
  const effectiveCard = hasTerminals
    ? terminalCardTotal
    : aggregateAllowed
      ? Number(formValues.cardHandedOver || 0)
      : 0;
  const effectiveUpi = hasTerminals
    ? terminalUpiTotal
    : aggregateAllowed
      ? Number(formValues.upiHandedOver || 0)
      : 0;

  // ---- Fuel-on-credit (credit chits) declared for this (attendant, DU) ----
  // Seeded on open; the drawer unmounts on close, so there is nothing to reset.
  const [creditLines, setCreditLines] = useState<any[]>(() => creditSales ?? []);
  // ---- OMC fleet-card sales (settled to CMS, not a receivable) ----
  const [omcLines, setOmcLines] = useState<any[]>(() => omcSales ?? []);
  const [ccOpen, setCcOpen] = useState(false);
  // Channel for a new line: 'credit' = station receivable, 'omc' = OMC card → CMS.
  const [ccChannel, setCcChannel] = useState<'credit' | 'omc'>('credit');
  const [ccSelectValue, setCcSelectValue] = useState('');
  const [ccCustomerId, setCcCustomerId] = useState('');
  const [ccCustomerName, setCcCustomerName] = useState('');
  const [ccCustomerType, setCcCustomerType] = useState<string | null>(null);
  const [ccVehicleId, setCcVehicleId] = useState<string | null>(null);
  const [ccVehicleLabel, setCcVehicleLabel] = useState('');
  const [ccProductId, setCcProductId] = useState('');
  const [ccQty, setCcQty] = useState('');
  const [ccPrice, setCcPrice] = useState('');
  const [ccAmount, setCcAmount] = useState('');
  const [ccNotes, setCcNotes] = useState('');
  const [ccBusy, setCcBusy] = useState(false);
  const runTask = useRunTask();
  // Idempotency key for the line currently being added — held across a failed
  // retry (same key → server de-dupes) and cleared on success or any edit.
  const ccIdemKeyRef = useRef<string | null>(null);
  // Inline create ("＋ New …") drawer state + optimistically-added records.
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newVehicleOpen, setNewVehicleOpen] = useState(false);
  const [extraCustomers, setExtraCustomers] = useState<any[]>([]);
  const [extraVehicles, setExtraVehicles] = useState<any[]>([]);
  // Cached vehicles (semi tier) for the client-side credit picker — no server search.
  const { data: allVehiclesData } = useAllVehicles(true);

  const resetCcRow = () => {
    ccIdemKeyRef.current = null;
    setCcSelectValue('');
    setCcChannel('credit');
    setCcCustomerId('');
    setCcCustomerName('');
    setCcCustomerType(null);
    setCcVehicleId(null);
    setCcVehicleLabel('');
    setCcProductId('');
    setCcQty('');
    setCcPrice('');
    setCcAmount('');
    setCcNotes('');
  };
  // Fuel products dispensed at this DU (from its nozzles).
  const duProducts = Array.from(
    new Map(
      nozzles
        .filter((n: any) => n.productId)
        .map((n: any) => [
          n.productId,
          {
            id: n.productId,
            name: n.productName ?? 'Fuel',
            code: n.productCode ?? '',
            price: Number(n.unitPrice || 0),
          },
        ]),
    ).values(),
  );

  // Credit-eligible vehicles = cached vehicles belonging to the credit customers
  // passed in (already Credit/Fleet, non-prepaid). Combined with the customers
  // into one client-side searchable option list — no server round-trips.
  // Records created inline (via the "＋ New …" options) are merged in optimistically.
  const allCustomers = useMemo(
    () => [...customers, ...extraCustomers],
    [customers, extraCustomers],
  );
  const allVehicles = useMemo(
    () => [...(allVehiclesData ?? []), ...extraVehicles],
    [allVehiclesData, extraVehicles],
  );
  const creditOptions = useMemo(() => {
    const customerIds = new Set(allCustomers.map((c: any) => c.id));
    const opts: { value: string; label: string; sublabel?: string }[] = [];
    for (const v of allVehicles) {
      if (!customerIds.has(v.customerId)) continue;
      const parts = [v.customerName ?? '', v.customerType, v.defaultProductName].filter(Boolean);
      opts.push({ value: `v:${v.id}`, label: v.registrationNumber, sublabel: parts.join(' · ') });
    }
    for (const c of allCustomers)
      opts.push({ value: `c:${c.id}`, label: c.name, sublabel: c.customerType });
    return opts;
  }, [allVehicles, allCustomers]);

  // Default channel for a selected customer: a prepaid Fleet account is an OMC
  // fleet card (settled to CMS); everything else is a station receivable.
  const defaultChannelFor = (cust: any): 'credit' | 'omc' =>
    cust?.customerType === 'Fleet' && cust?.isPrepaid ? 'omc' : 'credit';

  const handleCreditSelect = (value: string) => {
    if (value === NEW_CUSTOMER) {
      setNewCustomerOpen(true);
      return;
    }
    if (value === NEW_VEHICLE) {
      setNewVehicleOpen(true);
      return;
    }
    ccIdemKeyRef.current = null;
    setCcSelectValue(value);
    if (value.startsWith('v:')) {
      const v = allVehicles.find((x: any) => `v:${x.id}` === value);
      if (!v) return;
      const cust = allCustomers.find((c: any) => c.id === v.customerId);
      setCcCustomerId(v.customerId);
      setCcCustomerName(v.customerName ?? 'Customer');
      setCcCustomerType(v.customerType ?? cust?.customerType ?? null);
      setCcChannel(
        defaultChannelFor(cust ?? { customerType: v.customerType, isPrepaid: v.isPrepaid }),
      );
      setCcVehicleId(v.id);
      setCcVehicleLabel(v.registrationNumber);
      const match = duProducts.find((p) => p.id === v.defaultProductId);
      if (match) {
        setCcProductId(match.id);
        if (match.price > 0) setCcPrice(match.price.toFixed(2));
      }
    } else if (value.startsWith('c:')) {
      const id = value.slice(2);
      const c = allCustomers.find((x: any) => x.id === id);
      setCcCustomerId(id);
      setCcCustomerName(c?.name ?? 'Customer');
      setCcCustomerType(c?.customerType ?? null);
      setCcChannel(defaultChannelFor(c));
      setCcVehicleId(null);
      setCcVehicleLabel('');
    }
  };

  // Auto-select a record created inline via the "＋ New …" options.
  const handleCustomerCreated = (c: any) => {
    if (!c?.id) {
      setNewCustomerOpen(false);
      return;
    }
    setExtraCustomers((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
    setNewCustomerOpen(false);
    setCcSelectValue(`c:${c.id}`);
    setCcCustomerId(c.id);
    setCcCustomerName(c.name ?? 'Customer');
    setCcCustomerType(c.customerType ?? null);
    setCcChannel(defaultChannelFor(c));
    setCcVehicleId(null);
    setCcVehicleLabel('');
  };
  const handleVehicleCreated = (v: any) => {
    if (!v?.id) {
      setNewVehicleOpen(false);
      return;
    }
    setExtraVehicles((prev) => (prev.some((x) => x.id === v.id) ? prev : [...prev, v]));
    setNewVehicleOpen(false);
    setCcSelectValue(`v:${v.id}`);
    setCcCustomerId(v.customerId);
    setCcCustomerName(v.customerName ?? 'Customer');
    setCcCustomerType(v.customerType ?? null);
    setCcChannel(defaultChannelFor(allCustomers.find((c: any) => c.id === v.customerId) ?? v));
    setCcVehicleId(v.id);
    setCcVehicleLabel(v.registrationNumber ?? '');
    const match = duProducts.find((p) => p.id === v.defaultProductId);
    if (match) {
      setCcProductId(match.id);
      if (match.price > 0) setCcPrice(match.price.toFixed(2));
    }
  };

  const ccSelectedCustomer = allCustomers.find((c: any) => c.id === ccCustomerId);
  const ccLimit = Number(ccSelectedCustomer?.creditLimit ?? 0);
  const ccBalance = Number(ccSelectedCustomer?.currentBalance ?? 0);
  const ccAvailable = ccLimit > 0 ? ccLimit - ccBalance : null;
  const ccExceeds = ccAvailable != null && Number(ccAmount) > ccAvailable;

  const handleCcProductChange = (pid: string) => {
    ccIdemKeyRef.current = null;
    setCcProductId(pid);
    // Price is fixed per nozzle — keep it internal (drives qty↔amount), no manual entry.
    const p = duProducts.find((x) => x.id === pid);
    const price = p && p.price > 0 ? p.price : 0;
    setCcPrice(price > 0 ? price.toFixed(2) : '');
    const q = Number(ccQty);
    if (q > 0 && price > 0) setCcAmount((q * price).toFixed(2));
  };
  const handleCcQtyChange = (v: string) => {
    ccIdemKeyRef.current = null;
    setCcQty(v);
    const q = Number(v);
    const pr = Number(ccPrice);
    if (q > 0 && pr > 0) setCcAmount((q * pr).toFixed(2));
  };
  const handleCcAmountChange = (v: string) => {
    ccIdemKeyRef.current = null;
    setCcAmount(v);
    const a = Number(v);
    const pr = Number(ccPrice);
    if (a > 0 && pr > 0) setCcQty((a / pr).toFixed(3));
  };

  const addCreditLine = async () => {
    setError(null);
    const amt = Number(ccAmount);
    const isOmc = ccChannel === 'omc';
    if (!isOmc && !ccCustomerId) {
      setError('Search and select a customer or vehicle for the credit sale.');
      return;
    }
    if (!(amt > 0)) {
      setError('Enter a valid amount.');
      return;
    }
    try {
      setCcBusy(true);
      const idempotencyKey = ccIdemKeyRef.current ?? (ccIdemKeyRef.current = genIdemKey());
      const entry = await transactionService.recordCollection(
        {
          shiftId,
          customerId: ccCustomerId || undefined,
          vehicleId: ccVehicleId,
          productId: ccProductId || null,
          quantity: Number(ccQty) > 0 ? Number(ccQty) : null,
          unitPrice: ccPrice && Number(ccPrice) >= 0 ? Number(ccPrice) : null,
          amount: amt,
          paymentMethod: isOmc ? 'OMC' : 'Credit',
          attendantId: userId,
          duId,
          notes: ccNotes || undefined,
        },
        { idempotencyKey },
      );
      const prod = duProducts.find((p) => p.id === ccProductId);
      const line = {
        id: entry?.id,
        customerId: ccCustomerId || null,
        customerName: ccCustomerId
          ? ccCustomerName || ccSelectedCustomer?.name || 'Customer'
          : null,
        customerType: ccCustomerType ?? ccSelectedCustomer?.customerType ?? null,
        vehicleId: ccVehicleId,
        vehicleLabel: ccVehicleLabel || null,
        productId: ccProductId || null,
        productName: prod?.name ?? null,
        quantity: Number(ccQty) || null,
        unitPrice: Number(ccPrice) || null,
        amount: amt,
        notes: ccNotes || null,
      };
      if (isOmc) setOmcLines((prev) => [...prev, line]);
      else setCreditLines((prev) => [...prev, line]);
      setAcceptedResult(null);
      handoverRequestRef.current = null;
      resetCcRow();
      await onCreditChanged?.();
    } catch (e: any) {
      setError(e.message || 'Failed to add sale');
    } finally {
      setCcBusy(false);
    }
  };

  const removeCreditLine = async (id: string) => {
    if (!id) return;
    setError(null);
    try {
      setCcBusy(true);
      await transactionService.voidCreditSale(id);
      setCreditLines((prev) => prev.filter((l) => l.id !== id));
      setAcceptedResult(null);
      handoverRequestRef.current = null;
      await onCreditChanged?.();
    } catch (e: any) {
      setError(e.message || 'Failed to remove credit sale');
    } finally {
      setCcBusy(false);
    }
  };

  const removeOmcLine = async (id: string) => {
    if (!id) return;
    setError(null);
    try {
      setCcBusy(true);
      await transactionService.voidOmcCardSale(id);
      setOmcLines((prev) => prev.filter((l) => l.id !== id));
      setAcceptedResult(null);
      handoverRequestRef.current = null;
      await onCreditChanged?.();
    } catch (e: any) {
      setError(e.message || 'Failed to remove OMC card sale');
    } finally {
      setCcBusy(false);
    }
  };

  // Derived Calculations
  const calculatedNozzles = nozzles.map((nz) => {
    const opening = Number(nz.openingReading || 0);
    const closing = Number(formNozzleReadings[nz.nozzleId] ?? opening);
    const volume = Math.max(0, closing - opening);
    const price = Number(nz.unitPrice || 0);
    const testing = Number(formNozzleTesting[nz.nozzleId] || 0);

    const rawValue = volume * price;
    const testingDeduction = testing * price;

    return {
      ...nz,
      opening,
      closing,
      volume,
      price,
      testing,
      rawValue,
      testingDeduction,
    };
  });

  const totalVolumeSold = calculatedNozzles.reduce((sum, n) => sum + n.volume, 0);
  const totalRawSales = calculatedNozzles.reduce((sum, n) => sum + n.rawValue, 0);
  const totalTestingVolume = calculatedNozzles.reduce((sum, n) => sum + n.testing, 0);
  const totalTestingDeduction = calculatedNozzles.reduce((sum, n) => sum + n.testingDeduction, 0);
  // Fuel unit for this handover (a DU is normally single-product). Uses the
  // product's own unit code (L / kg); falls back to a neutral label if mixed.
  const handoverUnits = Array.from(new Set(calculatedNozzles.map((n: any) => n.unit || 'L')));
  const handoverUnitLabel = handoverUnits.length === 1 ? handoverUnits[0] : 'units';

  const expectedSales = Math.max(0, totalRawSales - totalTestingDeduction);

  // Fuel-on-credit lines are declared in this section and saved immediately
  // (each is a real receivable). The credit chits total is DERIVED from them and
  // sits on the DECLARED side — the fuel is already metered in the nozzle reading,
  // so credit is NOT added to expected (that would double-count).
  const creditTotal = creditLines.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  // OMC fleet-card sales — settled to CMS (a non-drawer channel), never a
  // receivable. Like credit, the fuel is metered so it sits on the declared side.
  const omcTotal = omcLines.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  // Recorded customer-sale lines grouped by receivable type (Credit / Fleet /
  // Regular), each with its own subtotal. Station-prepaid customers never reach
  // this list (they draw down a balance instead of accruing a receivable).
  const creditGroups = useMemo(() => {
    const ORDER = ['Credit', 'Fleet', 'Regular'];
    const LABELS: Record<string, string> = {
      Credit: 'Credit',
      Fleet: 'Fleet',
      Regular: 'Regular',
      Other: 'Other',
    };
    const map = new Map<string, any[]>();
    for (const l of creditLines) {
      const t = ORDER.includes(l.customerType) ? l.customerType : 'Other';
      (map.get(t) ?? map.set(t, []).get(t)!).push(l);
    }
    return [...ORDER, 'Other']
      .filter((t) => map.has(t))
      .map((t) => ({
        type: t,
        label: LABELS[t] ?? t,
        lines: map.get(t)!,
        subtotal: map.get(t)!.reduce((s, l) => s + Number(l.amount || 0), 0),
      }));
  }, [creditLines]);
  const totalDeclared =
    Number(formCash) + Number(effectiveCard) + Number(effectiveUpi) + creditTotal + omcTotal;
  // Walk-in merchandise cash this attendant collected (net of any card/UPI
  // portion) is part of what they hand over, so it's added to the expected side.
  const merchandiseCashNum = Number(merchandiseCash) || 0;
  const merchandiseNonCashNum = Number(merchandiseNonCash) || 0;
  const expectedTotal = expectedSales + merchandiseCashNum;
  // Round to paise so floating-point dust (e.g. -1e-13) doesn't read as a shortage.
  const variance = Math.round((totalDeclared - expectedTotal) * 100) / 100 || 0;

  // Volume sanity: credit litres billed for a fuel must not exceed the litres
  // metered (and not testing) for that fuel at this DU. Reactive to the readings.
  const meteredByProduct = new Map<string, number>();
  for (const n of calculatedNozzles) {
    if (!n.productId) continue;
    meteredByProduct.set(
      n.productId,
      (meteredByProduct.get(n.productId) ?? 0) + Math.max(0, n.volume - n.testing),
    );
  }
  const unitByProduct = new Map<string, string>();
  for (const n of calculatedNozzles) {
    if (n.productId) unitByProduct.set(n.productId, n.unit || 'L');
  }
  const creditLitresByProduct = new Map<string, number>();
  for (const l of [...creditLines, ...omcLines]) {
    if (l.productId && l.quantity)
      creditLitresByProduct.set(
        l.productId,
        (creditLitresByProduct.get(l.productId) ?? 0) + Number(l.quantity),
      );
  }
  const volumeOverages = Array.from(creditLitresByProduct.entries())
    .map(([pid, lit]) => ({
      name: duProducts.find((p) => p.id === pid)?.name ?? 'Fuel',
      unit: unitByProduct.get(pid) ?? 'L',
      lit,
      metered: meteredByProduct.get(pid) ?? 0,
    }))
    .filter((o) => o.lit > o.metered + 0.001);

  const onSubmit = async (values: HandoverFormValues) => {
    setError(null);

    // Terminals are assigned but no card/UPI declared: legitimate when no
    // customer paid by POS, but also the signature of a forgotten terminal
    // sheet — require one explicit confirmation.
    if (hasTerminals && !zeroTerminalsConfirmed) {
      const terminalTotal = duTerminals.reduce(
        (sum: number, t: any) =>
          sum +
          Number(values.terminalCard?.[t.terminalId] ?? 0) +
          Number(values.terminalUpi?.[t.terminalId] ?? 0),
        0,
      );
      if (terminalTotal === 0) {
        setZeroTerminalsConfirmed(true);
        setError(
          'No card/UPI takings entered for the assigned terminal(s). If that is correct, submit again to confirm; otherwise enter the terminal amounts.',
        );
        return;
      }
    }

    // Validate reading constraints: closing cannot be less than opening
    for (const nz of calculatedNozzles) {
      if (nz.closing < nz.opening) {
        setError(
          `Closing reading for nozzle ${nz.nozzleName} (${nz.closing}) cannot be less than opening reading (${nz.opening}).`,
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      const nozzleReadingsPayload = Object.entries(values.nozzleReadings).map(
        ([nozzleId, closingVal]) => ({
          nozzleId,
          closingReading: Number(closingVal),
          testingVolume: Number(values.nozzleTesting?.[nozzleId] ?? 0),
        }),
      );

      const payload: RecordHandoverPayload = {
        shiftId,
        userId,
        duId,
        cashHandedOver: Number(values.cashHandedOver),
        ...(aggregateAllowed
          ? {
              cardHandedOver: Number(values.cardHandedOver || 0),
              upiHandedOver: Number(values.upiHandedOver || 0),
            }
          : {}),
        nozzleReadings: nozzleReadingsPayload,
        terminalEntries: hasTerminals
          ? duTerminals.map((t: any) => ({
              terminalId: t.terminalId,
              duId: t.duId ?? null,
              cardAmount: Number(values.terminalCard?.[t.terminalId] ?? 0),
              upiAmount: Number(values.terminalUpi?.[t.terminalId] ?? 0),
            }))
          : undefined,
      };
      handoverRequestRef.current = resolveHandoverRequestIdentity(
        handoverRequestRef.current,
        payload,
      );
      if (stationId)
        saveHandoverRequestIdentity(stationId, shiftId, userId, duId, handoverRequestRef.current);
      const result = await recordHandover.mutateAsync({
        stationId: stationId ?? '',
        payload,
        idempotencyKey: handoverRequestRef.current.idempotencyKey,
      });
      for (const reading of result.nozzleReadings) {
        setValue(`nozzleReadings.${reading.nozzleId}`, reading.closingReading, {
          shouldDirty: false,
        });
        setValue(`nozzleTesting.${reading.nozzleId}`, reading.testingVolume, {
          shouldDirty: false,
        });
      }
      setValue('cashHandedOver', Number(result.handover.cashHandedOver), { shouldDirty: false });
      setValue('cardHandedOver', Number(result.handover.cardHandedOver), { shouldDirty: false });
      setValue('upiHandedOver', Number(result.handover.upiHandedOver), { shouldDirty: false });
      for (const entry of result.terminalEntries) {
        setValue(`terminalCard.${entry.terminalId}`, Number(entry.cardAmount), {
          shouldDirty: false,
        });
        setValue(`terminalUpi.${entry.terminalId}`, Number(entry.upiAmount), {
          shouldDirty: false,
        });
      }
      acceptedFormFingerprintRef.current = JSON.stringify(getValues());
      setAcceptedResult(result);
      handoverRequestRef.current = null;
      if (stationId) saveHandoverRequestIdentity(stationId, shiftId, userId, duId, null);
      onSaveSuccess();
    } catch (err: any) {
      const message = err.message || 'Failed to save attendant handover';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Drawer isOpen onClose={onClose} title={`Attendant Handover: ${userName} (${duCode})`}>
        <Form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
          {error && (
            <div
              role="alert"
              style={{
                backgroundColor: 'var(--state-danger-bg)',
                border: '1px solid var(--border-soft)',
                color: 'var(--state-danger-fg)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* 1. Nozzle Readings Section */}
          <div>
            <h3
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              1. Nozzle Readings & Calibration Testing
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {calculatedNozzles.map((nz) => (
                <div
                  key={nz.nozzleId}
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-input)',
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 110px 90px',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>
                      {nz.nozzleName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {nz.productCode} •{' '}
                      <strong>
                        ₹{nz.price.toFixed(2)}/{nz.unit || 'L'}
                      </strong>
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        display: 'block',
                        marginBottom: '2px',
                      }}
                    >
                      Opening
                    </label>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: 'var(--text-faint)',
                      }}
                    >
                      {nz.opening.toFixed(3)}
                    </span>
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        display: 'block',
                        marginBottom: '2px',
                      }}
                    >
                      Closing Rd
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min={nz.opening}
                      required
                      {...register(`nozzleReadings.${nz.nozzleId}`)}
                      style={{
                        width: '100%',
                        height: '28px',
                        padding: '0 6px',
                        border: `1px solid ${nz.closing < nz.opening ? 'var(--brand-danger)' : 'var(--border-strong)'}`,
                        borderRadius: 'var(--radius-input)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        textAlign: 'right',
                      }}
                    />
                    {nz.closing < nz.opening ? (
                      <span
                        style={{
                          color: 'var(--brand-danger)',
                          fontSize: '10px',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        Must be ≥ {nz.opening.toFixed(3)}
                      </span>
                    ) : errors.nozzleReadings?.[nz.nozzleId] ? (
                      <span
                        style={{
                          color: 'var(--brand-danger)',
                          fontSize: '10px',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        {errors.nozzleReadings[nz.nozzleId]?.message || 'Invalid'}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        display: 'block',
                        marginBottom: '2px',
                      }}
                    >
                      Testing ({nz.unit || 'L'})
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      {...register(`nozzleTesting.${nz.nozzleId}`)}
                      style={{
                        width: '100%',
                        height: '28px',
                        padding: '0 6px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-input)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        textAlign: 'right',
                      }}
                    />
                    {errors.nozzleTesting?.[nz.nozzleId] && (
                      <span
                        style={{
                          color: 'var(--brand-danger)',
                          fontSize: '10px',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        {errors.nozzleTesting[nz.nozzleId]?.message || 'Invalid'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Card / UPI collections — only the POS terminals assigned to THIS
             DU are shown (an attendant isn't aware of machines that weren't
             handed to them; shift-wide / other-DU machines are reconciled at
             shift close). */}
          {hasTerminals ? (
            <div>
              <h3
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                }}
              >
                2. Card / UPI Collections
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  POS Terminal Batches (Card / UPI per machine)
                </label>
                {duTerminals.map((t: any) => {
                  const both = t.supportsCard && t.supportsUpi;
                  return (
                    <div
                      key={t.terminalId}
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 'var(--radius-input)',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}
                      >
                        {t.label}
                        {t.provider && (
                          <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>
                            {' '}
                            · {t.provider}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: both ? '1fr 1fr' : '1fr',
                          gap: '8px',
                        }}
                      >
                        {t.supportsCard && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              Card (₹)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0"
                              {...register(`terminalCard.${t.terminalId}`)}
                              style={{
                                height: '30px',
                                padding: '0 8px',
                                border: '1px solid var(--border-strong)',
                                borderRadius: 'var(--radius-input)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                textAlign: 'right',
                              }}
                            />
                          </div>
                        )}
                        {t.supportsUpi && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              UPI (₹)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0"
                              {...register(`terminalUpi.${t.terminalId}`)}
                              style={{
                                height: '30px',
                                padding: '0 8px',
                                border: '1px solid var(--border-strong)',
                                borderRadius: 'var(--radius-input)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                textAlign: 'right',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    paddingTop: '2px',
                  }}
                >
                  <span>POS totals (derived)</span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>
                    Card {inr(terminalCardTotal)} · UPI {inr(terminalUpiTotal)}
                  </strong>
                </div>
              </div>
            </div>
          ) : aggregateAllowed ? (
            <div>
              <h3
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                }}
              >
                2. Card / UPI Collections
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Card total (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    {...register('cardHandedOver')}
                    style={{
                      height: '30px',
                      padding: '0 8px',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-input)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      textAlign: 'right',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    UPI total (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    {...register('upiHandedOver')}
                    style={{
                      height: '30px',
                      padding: '0 8px',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-input)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      textAlign: 'right',
                    }}
                  />
                </div>
              </div>
              <span
                style={{
                  display: 'block',
                  marginTop: '4px',
                  fontSize: '10px',
                  color: 'var(--text-faint)',
                }}
              >
                Aggregate declaration used because no Payment Terminal is configured.
              </span>
            </div>
          ) : (
            <div
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-input)',
                backgroundColor: 'var(--bg-surface-alt)',
                color: 'var(--text-muted)',
                fontSize: '11px',
              }}
            >
              No Payment Terminal is assigned to this Dispenser. Card and UPI declarations must be
              recorded against an assigned terminal.
            </div>
          )}

          {/* 3. Customer sales (on-account fuel) for this DU */}
          <div>
            <h3
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span>3. Customer Sales</span>
              {creditTotal + omcTotal > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                  {inr(creditTotal + omcTotal)}
                </span>
              )}
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '10px' }}>
              Fuel billed to a customer's account (Credit / Fleet / Regular receivable) or paid by
              an OMC fleet card (settled to the CMS account — not a receivable). Each line is
              recorded immediately; the fuel is already metered, so it sits on the declared side.
            </p>

            {volumeOverages.length > 0 && (
              <div
                style={{
                  backgroundColor: 'var(--state-warning-bg)',
                  color: 'var(--state-warning-fg)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-input)',
                  padding: '8px 10px',
                  fontSize: '11px',
                  marginBottom: '10px',
                }}
              >
                Credit quantity exceeds metered volume for{' '}
                {volumeOverages
                  .map(
                    (o) =>
                      `${o.name} (${o.lit.toLocaleString('en-IN')} ${o.unit} billed vs ${o.metered.toLocaleString('en-IN')} ${o.unit} metered)`,
                  )
                  .join(', ')}
                . Check the readings or the credit quantities.
              </div>
            )}

            {creditGroups.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginBottom: '10px',
                }}
              >
                {creditGroups.map((g) => (
                  <div
                    key={g.type}
                    style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      <span>{g.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                        {inr(g.subtotal)}
                      </span>
                    </div>
                    {g.lines.map((l, idx) => (
                      <div
                        key={l.id ?? idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          backgroundColor: 'var(--bg-surface-alt)',
                          border: '1px solid var(--border-soft)',
                          borderRadius: 'var(--radius-input)',
                          padding: '8px 10px',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--text-strong)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {l.customerName}
                            {l.vehicleLabel ? ` · ${l.vehicleLabel}` : ''}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {l.productName ?? 'Fuel'}
                            {l.quantity ? ` · ${Number(l.quantity).toLocaleString('en-IN')} L` : ''}
                            {l.notes ? ` · ${l.notes}` : ''}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            flexShrink: 0,
                          }}
                        >
                          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                            {inr(l.amount)}
                          </strong>
                          <button
                            type="button"
                            onClick={() =>
                              runTask(removeCreditLine(l.id), 'Could not void the credit sale.')
                            }
                            disabled={ccBusy}
                            title="Void this credit sale"
                            aria-label="Void this credit sale"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--brand-danger)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon name="x" size="xs" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {omcLines.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  marginBottom: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <span>OMC card · CMS</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                    {inr(omcTotal)}
                  </span>
                </div>
                {omcLines.map((l, idx) => (
                  <div
                    key={l.id ?? idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      backgroundColor: 'var(--bg-surface-alt)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-input)',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-strong)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {l.customerName || 'OMC card (no customer)'}
                        {l.vehicleLabel ? ` · ${l.vehicleLabel}` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {l.productName ?? 'Fuel'}
                        {l.quantity ? ` · ${Number(l.quantity).toLocaleString('en-IN')} L` : ''}
                        {l.notes ? ` · ${l.notes}` : ''}
                      </div>
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}
                    >
                      <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                        {inr(l.amount)}
                      </strong>
                      <button
                        type="button"
                        onClick={() =>
                          runTask(removeOmcLine(l.id), 'Could not void the OMC card sale.')
                        }
                        disabled={ccBusy}
                        title="Void this OMC card sale"
                        aria-label="Void this OMC card sale"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--brand-danger)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="x" size="xs" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!ccOpen ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Icon name="plus" size="xs" />}
                onClick={() => setCcOpen(true)}
                style={{ alignSelf: 'flex-start' }}
              >
                Add customer sale
              </Button>
            ) : (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-input)',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Channel: station receivable (Credit) vs OMC fleet card (→ CMS) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Payment channel
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['credit', 'omc'] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setCcChannel(ch)}
                        disabled={ccBusy}
                        style={{
                          flex: 1,
                          height: '30px',
                          borderRadius: 'var(--radius-input)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: `1px solid ${ccChannel === ch ? 'var(--brand-primary)' : 'var(--border-strong)'}`,
                          background:
                            ccChannel === ch ? 'var(--bg-surface-alt)' : 'var(--bg-surface)',
                          color: ccChannel === ch ? 'var(--brand-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {ch === 'credit' ? 'Credit (receivable)' : 'OMC card → CMS'}
                      </button>
                    ))}
                  </div>
                  {ccChannel === 'omc' && (
                    <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>
                      Settled to CMS by the Oil Company — not a receivable. Customer is optional.
                    </span>
                  )}
                </div>

                {/* Combined picker: customer name OR vehicle number (cached, client-side) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Customer or vehicle{ccChannel === 'omc' ? ' (optional)' : ''}
                  </label>
                  <Combobox
                    options={creditOptions}
                    value={ccSelectValue}
                    onChange={handleCreditSelect}
                    placeholder="Select customer or vehicle…"
                    searchPlaceholder="Search name or vehicle no.…"
                    emptyMessage="No credit customer or vehicle found."
                    createActions={[
                      {
                        label: '＋ New customer',
                        sublabel: 'Create and bill in one step',
                        onSelect: () => setNewCustomerOpen(true),
                      },
                      {
                        label: '＋ New vehicle',
                        sublabel: 'Add a vehicle to a customer',
                        onSelect: () => setNewVehicleOpen(true),
                      },
                    ]}
                  />
                  {ccChannel === 'credit' && ccCustomerId && ccAvailable != null && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Available credit {inr(ccAvailable)}
                    </span>
                  )}
                </div>

                {(ccCustomerId || ccChannel === 'omc') && (
                  <>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '8px' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          minWidth: 0,
                        }}
                      >
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Fuel</label>
                        <select
                          value={ccProductId}
                          onChange={(e) => handleCcProductChange(e.target.value)}
                          disabled={ccBusy}
                          style={{
                            height: '30px',
                            padding: '0 6px',
                            width: '100%',
                            minWidth: 0,
                            border: '1px solid var(--border-strong)',
                            borderRadius: 'var(--radius-input)',
                            fontSize: '12px',
                          }}
                        >
                          <option value="">-- Fuel --</option>
                          {duProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.code ? ` (${p.code})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          minWidth: 0,
                        }}
                      >
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          Qty (L){ccPrice ? ` · ₹${ccPrice}/L` : ''}
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={ccQty}
                          onChange={(e) => handleCcQtyChange(e.target.value)}
                          disabled={ccBusy}
                          style={{
                            height: '30px',
                            padding: '0 6px',
                            width: '100%',
                            minWidth: 0,
                            border: '1px solid var(--border-strong)',
                            borderRadius: 'var(--radius-input)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            textAlign: 'right',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          minWidth: 0,
                        }}
                      >
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          Amount (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ccAmount}
                          onChange={(e) => handleCcAmountChange(e.target.value)}
                          disabled={ccBusy}
                          style={{
                            height: '30px',
                            padding: '0 6px',
                            width: '100%',
                            minWidth: 0,
                            border: '1px solid var(--border-strong)',
                            borderRadius: 'var(--radius-input)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            textAlign: 'right',
                            fontWeight: 600,
                          }}
                        />
                      </div>
                    </div>
                    <div
                      style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}
                    >
                      <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Remarks (driver, slip no., notes)
                      </label>
                      <input
                        type="text"
                        value={ccNotes}
                        onChange={(e) => setCcNotes(e.target.value)}
                        disabled={ccBusy}
                        placeholder="e.g. driver name / phone / slip ref"
                        style={{
                          height: '30px',
                          padding: '0 8px',
                          width: '100%',
                          minWidth: 0,
                          border: '1px solid var(--border-strong)',
                          borderRadius: 'var(--radius-input)',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                    {ccChannel === 'credit' && ccExceeds && (
                      <div style={{ fontSize: '11px', color: 'var(--state-warning-fg)' }}>
                        Exceeds available credit
                        {ccAvailable != null ? ` (${inr(ccAvailable)})` : ''} — you can still record
                        it.
                      </div>
                    )}
                  </>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    leftIcon={<Icon name="plus" size="xs" />}
                    onClick={addCreditLine}
                    disabled={(ccChannel === 'credit' && !ccCustomerId) || !(Number(ccAmount) > 0)}
                    loading={ccBusy}
                  >
                    {ccChannel === 'omc' ? 'Add OMC card sale' : 'Add credit sale'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      resetCcRow();
                      setCcOpen(false);
                    }}
                    disabled={ccBusy}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Cash & credit chits total */}
          <div>
            <h3
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              4. Cash Deposit
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>
                  Cash Handed Over (₹)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    {...register('cashHandedOver')}
                    style={{
                      height: '32px',
                      padding: '0 8px',
                      flex: 1,
                      minWidth: 0,
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-input)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      textAlign: 'right',
                    }}
                  />
                  <CashCountPopover
                    breakdown={cashBreakdown}
                    onBreakdownChange={setCashBreakdown}
                    onApply={(t) =>
                      setValue('cashHandedOver', t as any, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    currentValue={Number(formCash) || 0}
                    title="Count handover cash by denomination"
                  />
                </div>
                {errors.cashHandedOver && (
                  <span style={{ color: 'var(--brand-danger)', fontSize: '10px' }}>
                    {errors.cashHandedOver.message}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>
                  Credit Chits Total (₹)
                </label>
                <div
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    border: '1px dashed var(--border-strong)',
                    borderRadius: 'var(--radius-input)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-surface-alt)',
                    color: 'var(--text-default)',
                  }}
                  title="Auto-derived from the fuel-on-credit sales above"
                >
                  {inr(creditTotal)}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>
                  Auto from credit sales above
                </span>
              </div>
            </div>
          </div>

          {/* 5. Live Reconciliation Summary Card */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-alt)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-input)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                fontWeight: 600,
                color: acceptedResult ? 'var(--state-success-fg)' : 'var(--text-faint)',
              }}
            >
              <span>{acceptedResult ? 'Accepted by server' : 'Live preview'}</span>
              {acceptedResult && <span>Saved</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Derived Fuel Volume:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {(acceptedResult
                  ? acceptedResult.nozzleReadings.reduce(
                      (sum, reading) => sum + reading.grossVolume,
                      0,
                    )
                  : totalVolumeSold
                ).toFixed(3)}{' '}
                {handoverUnitLabel}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Testing/Calibration Volume:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {(acceptedResult
                  ? acceptedResult.nozzleReadings.reduce(
                      (sum, reading) => sum + reading.testingVolume,
                      0,
                    )
                  : totalTestingVolume
                ).toFixed(1)}{' '}
                {handoverUnitLabel}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Expected Fuel Sales Value:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {inr(acceptedResult?.expectedSales ?? expectedSales)}
              </strong>
            </div>
            {(merchandiseCashNum > 0 || merchandiseNonCashNum > 0) && (
              <>
                {merchandiseCashNum > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>+ Merchandise sold (cash):</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {inr(merchandiseCashNum)}
                    </strong>
                  </div>
                )}
                {merchandiseNonCashNum > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--text-faint)',
                    }}
                  >
                    <span>Merchandise (card/UPI, on terminal):</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {inr(merchandiseNonCashNum)}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <span>Total Expected:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>
                    {inr(acceptedResult?.expectedTotal ?? expectedTotal)}
                  </strong>
                </div>
              </>
            )}
            {creditTotal > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                }}
              >
                <span>of which on credit (chits):</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{inr(creditTotal)}</strong>
              </div>
            )}
            {omcTotal > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                }}
              >
                <span>of which OMC card (→ CMS):</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{inr(omcTotal)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Declared Deposit Sum:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {inr(acceptedResult?.declaredTotal ?? totalDeclared)}
              </strong>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 700,
                borderTop: '1px solid var(--border-soft)',
                paddingTop: '8px',
                marginTop: '4px',
                color:
                  (acceptedResult?.varianceAmount ?? variance) === 0
                    ? 'var(--state-success-fg)'
                    : (acceptedResult?.varianceAmount ?? variance) > 0
                      ? 'var(--brand-warning)'
                      : 'var(--brand-danger)',
              }}
            >
              <span>Handover Variance:</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {(acceptedResult?.varianceAmount ?? variance) > 0 ? '+' : ''}
                {inr(acceptedResult?.varianceAmount ?? variance)}
                {(acceptedResult?.varianceAmount ?? variance) === 0
                  ? ' (Balanced)'
                  : (acceptedResult?.varianceAmount ?? variance) > 0
                    ? ' (Surplus)'
                    : ' (Shortage)'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {calculatedNozzles.some((n) => n.closing < n.opening) && (
            <div
              style={{
                backgroundColor: 'var(--state-danger-bg)',
                color: 'var(--state-danger-fg)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-input)',
                padding: '8px 10px',
                fontSize: '11px',
              }}
            >
              One or more closing readings are below their opening reading. Fix the highlighted
              fields before saving.
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <Button
              type="submit"
              variant="primary"
              disabled={calculatedNozzles.some((n) => n.closing < n.opening)}
              loading={submitting}
              style={{ flex: 1, height: '36px' }}
            >
              {acceptedResult ? 'Save Changes' : 'Save Handover & Readings'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              style={{ flex: 1, height: '36px' }}
            >
              {acceptedResult ? 'Done' : 'Cancel'}
            </Button>
          </div>
        </Form>
      </Drawer>

      {/* Inline create: reuse the standard customer / vehicle drawers, auto-select on save. */}
      <CustomerFormDrawer
        isOpen={newCustomerOpen}
        editingCustomer={null}
        stationId={stationId}
        onClose={() => setNewCustomerOpen(false)}
        onCreated={handleCustomerCreated}
      />
      <VehicleDrawer
        isOpen={newVehicleOpen}
        editingVehicle={null}
        defaultCustomerId={ccCustomerId || ''}
        eligibleCustomers={allCustomers}
        fuelProducts={duProducts.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
        onClose={() => setNewVehicleOpen(false)}
        onCreated={handleVehicleCreated}
      />
    </>
  );
};
