import React, { useState, useEffect, useRef, useMemo } from 'react';
import { InfoTip } from '../primitives/InfoTip.js';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Drawer } from '../Drawer.js';
import {
  Button,
  DataSection,
  Form,
  Icon,
  Input,
  InteractiveTable,
  SectionHeader,
  SegmentedControl,
  Select,
  STATUS_MAP,
  VarianceChip,
  type TableColumn,
} from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { Combobox } from '../primitives/Combobox.js';
import { CashCountPopover, type CashBreakdown } from '../primitives/CashCountPopover.js';
import { CustomerFormDrawer } from '../customers/CustomerFormDrawer.js';
import { VehicleDrawer } from '../customers/VehicleDrawer.js';
import {
  useAllVehicles,
  useCustomers,
  useMerchandiseHandovers,
  useMerchandiseSales,
} from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';
import {
  CloudTransactionService,
  type RecordHandoverPayload,
  type RecordHandoverResult,
} from '../../services/cloud.js';
import { useRecordHandoverMutation } from '../../query/handoverMutation.js';
import { officeSubmitKeys, sendKeyed } from '../../office-records/submitKeys.js';
import { formatMoney, formatQuantity, MINUS } from '../../utils/format.js';
import { useRunTask } from '../../utils/runTask.js';
import { CloseNote } from './CloseShiftSteps.js';
import { denominationCountError } from './closeShiftModel.js';
import { HandoverProductSaleDrawer } from './HandoverProductSaleDrawer.js';
import {
  acceptedHandoverRecon,
  handoverNozzles,
  handoverRecon,
  handoverReconInput,
  sumAmounts,
  type HandoverNozzleRow,
} from './handoverFigures.js';

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
  cashDrops: z.coerce.number().nonnegative('Cash drops must be non-negative'),
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

/** A typed figure, '' while the box is blank (the schema coerces it on submit). */
type Typed = number | '';

/** The form as the operator types it: number boxes start blank, not at 0 (#302). */
interface HandoverFormInput {
  cashHandedOver: Typed;
  cashDrops: Typed;
  cardHandedOver: Typed;
  upiHandedOver: Typed;
  nozzleReadings: Record<string, Typed>;
  nozzleTesting: Record<string, Typed>;
  terminalCard?: Record<string, Typed>;
  terminalUpi?: Record<string, Typed>;
}

/** The schema's resolver, typed for the blank-able input it coerces. */
const handoverResolver = zodResolver(handoverFormSchema) as unknown as Resolver<
  HandoverFormInput,
  unknown,
  HandoverFormValues
>;

const typed = (v: unknown): Typed => Number(v) || '';

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
  /** Fuel-on-credit lines already recorded for this (attendant, DU). */
  creditSales?: any[];
  /** OMC fleet-card sale lines already recorded for this (attendant, DU). */
  omcSales?: any[];
  /** Product sales paid in cash this attendant collected (folds into expected). */
  merchandiseCash?: number;
  /** Product sales paid by card/UPI on a terminal (informational; not in cash expected). */
  merchandiseNonCash?: number;
  /** This Drawer's Opening Float, issued at shift open (ADR 0005). */
  openingFloat?: number;
  /** Called after a credit line is added/voided so the parent can refetch status. */
  onCreditChanged?: () => void | Promise<void>;
  existingHandover: any;
  onSaveSuccess: () => void;
}

/**
 * The Handover drawer (#534): one Drawer's nozzle readings, card / UPI
 * batches, customer sales, cash and drops, and the reconciliation that reads
 * expected = float + fuel cash + product cash − drops, with its variance in
 * the shared vocabulary.
 *
 * The body only exists while the drawer is open, so everything it prefills from
 * props is an initial value rather than something an effect has to push in and
 * then defend with a latch. The latch existed because recording a credit sale
 * calls `onCreditChanged()`, which refetches and hands back fresh `nozzles` /
 * `terminals` / `existingHandover` identities mid-entry; unmounting on close
 * expresses "once per open" directly, so the refetch is simply not a re-open.
 */
export const HandoverDrawer: React.FC<HandoverDrawerProps> = (props) =>
  props.isOpen ? <HandoverDrawerBody {...props} /> : null;

/** A field label above its control, 12px. */
const FieldLabel: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({
  htmlFor,
  children,
}) => (
  <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink-muted">
    {children}
  </label>
);

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <span className="text-[12px] text-danger-fg">{message}</span> : null;

/** A reconciliation line: label left, mono figure right. */
const ReconLine: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  total?: boolean;
  muted?: boolean;
}> = ({ label, value, total, muted }) => (
  <div
    className={cn(
      'flex items-center justify-between gap-3 text-[13px]',
      total && 'border-t border-border-soft pt-1.5 font-semibold text-ink-strong',
      muted && 'text-ink-muted',
    )}
  >
    <dt className="flex items-center gap-1.5">{label}</dt>
    <dd className="font-mono tabular-nums">{value}</dd>
  </div>
);

const minus = (v: number) => (v === 0 ? formatMoney(0) : `${MINUS}${formatMoney(v)}`);
const plus = (v: number) => (v === 0 ? formatMoney(0) : `+${formatMoney(v)}`);

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
  creditSales = [],
  omcSales = [],
  merchandiseCash = 0,
  merchandiseNonCash = 0,
  openingFloat = 0,
  onCreditChanged,
  existingHandover,
  onSaveSuccess,
}) => {
  const formId = `handover-form-${duId}`;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guard against a forgotten POS sheet: terminals configured but zero card/UPI
  // declared needs one explicit confirmation before submit.
  const [zeroTerminalsConfirmed, setZeroTerminalsConfirmed] = useState(false);
  const [acceptedResult, setAcceptedResult] = useState<RecordHandoverResult | null>(null);
  const toast = useToast();
  // One Idempotency-Key session per drawer open (#534): a retry after a lost
  // answer reuses the key, even when edited (the server refuses an edited
  // retry). A customer sale added or voided changes what the server would
  // reconcile, so it starts a new session.
  const keyScope = `shift:handover:${shiftId}:${userId}:${duId}`;
  const [keySession, setKeySession] = useState(() => officeSubmitKeys.session(keyScope));
  const renewKeySession = () => setKeySession(officeSubmitKeys.session(keyScope));
  const recordHandover = useRecordHandoverMutation();
  // Denomination counts for the handover cash (held here so re-opening the
  // popover preserves them). Reset when the drawer opens.
  const [cashBreakdown, setCashBreakdown] = useState<CashBreakdown>({});
  // Starts open only when editing a handover that already has drops (#304).
  const [hasDrops, setHasDrops] = useState(() => Number(existingHandover?.cashDrops) > 0);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<HandoverFormInput, unknown, HandoverFormValues>({
    resolver: handoverResolver,
    // Built once on open. Closing readings start from the opening reading as a
    // helpful anchor, and testing pre-fills from the previously-saved value so
    // re-saving a handover cannot silently zero a calibration volume.
    defaultValues: (() => {
      const existingEntries: any[] = existingHandover?.terminalEntries ?? [];
      const nozzleReadings: Record<string, Typed> = {};
      const nozzleTesting: Record<string, Typed> = {};
      for (const nz of nozzles) {
        nozzleReadings[nz.nozzleId] = Number(nz.closingReading ?? nz.openingReading ?? 0);
        nozzleTesting[nz.nozzleId] = typed(nz.testingVolume);
      }
      const terminalCard: Record<string, Typed> = {};
      const terminalUpi: Record<string, Typed> = {};
      for (const t of terminals.filter((x: any) => x.duId === duId)) {
        const prior = existingEntries.find((e) => e.terminalId === t.terminalId);
        terminalCard[t.terminalId] = typed(prior?.cardAmount);
        terminalUpi[t.terminalId] = typed(prior?.upiAmount);
      }
      return {
        cashHandedOver: typed(existingHandover?.cashHandedOver),
        cashDrops: typed(existingHandover?.cashDrops),
        cardHandedOver: typed(existingHandover?.cardHandedOver),
        upiHandedOver: typed(existingHandover?.upiHandedOver),
        nozzleReadings,
        nozzleTesting,
        terminalCard,
        terminalUpi,
      };
    })(),
  });
  const acceptedFormFingerprintRef = useRef<string | null>(null);

  // Watch form values reactively for live expected sales and variance computations
  const formValues = watch();
  useEffect(() => {
    if (acceptedResult && acceptedFormFingerprintRef.current !== JSON.stringify(formValues)) {
      setAcceptedResult(null);
    }
  }, [acceptedResult, formValues]);
  const formCash = formValues.cashHandedOver || 0;

  // POS terminals assigned to THIS DU (shift-wide / other-DU machines are not
  // shown to the attendant). When present, card/UPI aggregates are derived from
  // the per-terminal batches (single source of truth).
  const duTerminals = terminals.filter((t: any) => t.duId === duId);
  const hasTerminals = duTerminals.length > 0;
  const aggregateAllowed = !stationHasConfiguredTerminals;

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
  const vehiclesQ = useAllVehicles(true);
  const allVehiclesData = vehiclesQ.data;
  // Customers pickable for on-account billing: all except legacy
  // station-prepaid non-fleet wallets. Prepaid Fleet customers are included
  // (OMC fleet cards, settled to CMS).
  const customersQ = useCustomers(true);
  const customers = useMemo(
    () => (customersQ.data ?? []).filter((c: any) => c.customerType === 'Fleet' || !c.isPrepaid),
    [customersQ.data],
  );
  // The shift's Product Sales (cached operational reads, shared with Live
  // shift), so "Edit" opens this employee's Handover Product Sale (#533).
  const productHandoversQ = useMerchandiseHandovers(shiftId);
  const productBilledQ = useMerchandiseSales(shiftId);
  const [productSale, setProductSale] = useState({ open: false, token: 0 });

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

  /**
   * Started, never awaited. The credit line and the button's idle state come
   * from the write's own response; the parent's invalidate + shift-status
   * refetch only refreshes balances elsewhere on the screen. Awaiting it here
   * is what kept the spinner running for seconds after the sale was recorded
   * (#219), and the prefill latch already stops the refetch clobbering entry.
   */
  const refreshAfterCreditChange = () =>
    runTask(onCreditChanged?.(), 'Sale recorded, but the screen could not be refreshed.');

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
      renewKeySession();
      resetCcRow();
      refreshAfterCreditChange();
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
      // One key per void, through the shared store: a retry of the same void
      // after a lost answer reuses it, so it cannot void twice.
      await sendKeyed(
        officeSubmitKeys.session(`credit-sale:void:${id}`),
        { stationId, shiftId, id },
        (idempotencyKey) => transactionService.voidCreditSale(id, { idempotencyKey }),
      );
      setCreditLines((prev) => prev.filter((l) => l.id !== id));
      setAcceptedResult(null);
      renewKeySession();
      refreshAfterCreditChange();
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
      await sendKeyed(
        officeSubmitKeys.session(`omc-card-sale:void:${id}`),
        { stationId, shiftId, id },
        (idempotencyKey) => transactionService.voidOmcCardSale(id, { idempotencyKey }),
      );
      setOmcLines((prev) => prev.filter((l) => l.id !== id));
      setAcceptedResult(null);
      renewKeySession();
      refreshAfterCreditChange();
    } catch (e: any) {
      setError(e.message || 'Failed to remove OMC card sale');
    } finally {
      setCcBusy(false);
    }
  };

  // Derived figures: the nozzles, the customer sales and the reconciliation.
  const fuel = handoverNozzles(
    nozzles,
    formValues.nozzleReadings || {},
    formValues.nozzleTesting || {},
  );
  const anyInvalid = fuel.rows.some((r) => r.invalid);

  // Fuel-on-credit lines are declared in this section and saved immediately
  // (each is a real receivable). The credit chits total is DERIVED from them and
  // sits on the DECLARED side — the fuel is already metered in the nozzle reading,
  // so credit is NOT added to expected (that would double-count).
  const creditTotal = sumAmounts(creditLines);
  // OMC fleet-card sales — settled to CMS (a non-drawer channel), never a
  // receivable. Like credit, the fuel is metered so it sits on the declared side.
  const omcTotal = sumAmounts(omcLines);
  // Recorded customer-sale lines grouped by receivable type (Credit / Fleet /
  // Regular), each with its own subtotal. Station-prepaid customers never reach
  // this list (they draw down a balance instead of accruing a receivable).
  const creditGroups = useMemo(() => {
    const ORDER = ['Credit', 'Fleet', 'Regular'];
    const map = new Map<string, any[]>();
    for (const l of creditLines) {
      const t = ORDER.includes(l.customerType) ? l.customerType : 'Other';
      (map.get(t) ?? map.set(t, []).get(t)!).push(l);
    }
    return [...ORDER, 'Other']
      .filter((t) => map.has(t))
      .map((t) => ({ type: t, label: t, lines: map.get(t)!, subtotal: sumAmounts(map.get(t)!) }));
  }, [creditLines]);

  // The reconciliation: the live preview, or the server's figures once accepted.
  // The form mapped as the payload carries it, every amount raw (#534 review).
  const reconInput = handoverReconInput({
    terminals: duTerminals,
    aggregateAllowed,
    values: formValues,
    creditLines,
    omcLines,
    fuelSales: fuel.fuelSales,
    productCash: Number(merchandiseCash) || 0,
    openingFloat: Number(openingFloat) || 0,
  });
  const terminalCardTotal = reconInput.terminalCard;
  const terminalUpiTotal = reconInput.terminalUpi;
  const recon = acceptedResult ? acceptedHandoverRecon(acceptedResult) : handoverRecon(reconInput);
  const productNonCash = Number(merchandiseNonCash) || 0;
  const shownVolume = acceptedResult
    ? acceptedResult.nozzleReadings.reduce((sum, reading) => sum + reading.grossVolume, 0)
    : fuel.volume;
  const shownTesting = acceptedResult
    ? acceptedResult.nozzleReadings.reduce((sum, reading) => sum + reading.testingVolume, 0)
    : fuel.testing;

  // Volume sanity: credit litres billed for a fuel must not exceed the litres
  // metered (and not testing) for that fuel at this DU. Reactive to the readings.
  const unitByProduct = new Map<string, string>();
  for (const r of fuel.rows) if (r.productId) unitByProduct.set(r.productId, r.unit);
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
      metered: fuel.meteredByProduct.get(pid) ?? 0,
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
    for (const nz of fuel.rows) {
      if (nz.invalid) {
        setError(
          `Closing reading for nozzle ${nz.nozzle} (${nz.closing}) cannot be less than opening reading (${nz.opening}).`,
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
        cashDrops: Number(values.cashDrops || 0),
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
      // The readings and the handover are one write; the fingerprint names the
      // station and the customer sales it reconciles against.
      const fingerprint = {
        stationId,
        payload,
        customerSales: [...creditLines, ...omcLines].map((l) => l.id ?? null),
      };
      const result = await sendKeyed(keySession, fingerprint, (idempotencyKey) =>
        recordHandover.mutateAsync({ stationId: stationId ?? '', payload, idempotencyKey }),
      );
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
      onSaveSuccess();
    } catch (err: any) {
      const message = err.message || 'Failed to save attendant handover';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── The nozzle table: closing and testing are inputs in the row ──────────
  const nozzleColumns: TableColumn<HandoverNozzleRow>[] = [
    {
      id: 'nozzle',
      header: 'Nozzle',
      kind: 'text',
      sortable: false,
      value: (r) => r.nozzle,
      width: '22%',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-semibold text-ink-strong">{r.nozzle}</span>
          <span className="text-[12px] text-ink-muted">
            {r.product} · {formatMoney(r.rate)}/{r.unit}
          </span>
        </div>
      ),
    },
    {
      id: 'opening',
      header: 'Opening',
      kind: 'qty',
      decimals: 3,
      sortable: false,
      total: false,
      value: (r) => r.opening,
      cell: (r) => <span className="text-ink-muted">{r.opening.toFixed(3)}</span>,
    },
    {
      id: 'closing',
      header: 'Closing',
      kind: 'qty',
      sortable: false,
      total: false,
      width: '22%',
      value: (r) => r.closing,
      cell: (r) => {
        const fieldError = errors.nozzleReadings?.[r.nozzleId]?.message;
        return (
          <div className="flex flex-col items-end gap-0.5">
            <Input
              inputSize="sm"
              type="number"
              step="0.001"
              min={r.opening}
              required
              aria-label={`${r.nozzle} closing reading`}
              invalid={r.invalid || !!fieldError}
              className="w-32 text-right font-mono"
              {...register(`nozzleReadings.${r.nozzleId}`)}
            />
            {r.invalid ? (
              <span className="text-[12px] text-danger-fg">Must be ≥ {r.opening.toFixed(3)}</span>
            ) : (
              <FieldError message={fieldError} />
            )}
          </div>
        );
      },
    },
    {
      id: 'testing',
      header: 'Testing',
      kind: 'qty',
      sortable: false,
      width: '16%',
      value: (r) => r.testing,
      cell: (r) => (
        <div className="flex flex-col items-end gap-0.5">
          <Input
            inputSize="sm"
            type="number"
            step="0.1"
            min="0"
            placeholder="0"
            aria-label={`${r.nozzle} testing, ${r.unit}`}
            className="w-20 text-right font-mono"
            {...register(`nozzleTesting.${r.nozzleId}`)}
          />
          <FieldError message={errors.nozzleTesting?.[r.nozzleId]?.message} />
        </div>
      ),
    },
    {
      id: 'litres',
      header: 'Litres',
      kind: 'qty',
      sortable: false,
      value: (r) => r.volume,
      unit: (r) => r.unit,
      decimals: 3,
    },
  ];

  const footer = (
    <div className="flex w-full items-center gap-3">
      <Button type="button" variant="secondary" size="md" onClick={onClose}>
        {acceptedResult ? 'Done' : 'Cancel'}
      </Button>
      <div className="ml-auto flex items-center gap-2 text-[13px] text-ink-muted">
        Variance
        <VarianceChip amount={recon.variance} size="md" data-testid="handover-variance" />
      </div>
      <Button
        type="submit"
        form={formId}
        variant="primary"
        size="md"
        disabled={anyInvalid}
        loading={submitting}
      >
        {acceptedResult ? 'Save changes' : 'Save handover & readings'}
      </Button>
    </div>
  );

  return (
    <>
      <Drawer
        isOpen
        onClose={onClose}
        widthVariant="wide"
        title={`Handover · ${duCode} · ${userName}`}
        subtitle={`${
          STATUS_MAP[existingHandover || acceptedResult ? 'handover-recorded' : 'handover-pending']
            .label
        } · attendant handover`}
        footer={footer}
      >
        <Form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          {error && (
            <CloseNote tone="danger" role="alert">
              {error}
            </CloseNote>
          )}

          {/* 1. Nozzle readings */}
          <section className="flex flex-col gap-2" aria-label="Nozzle readings">
            <SectionHeader title="Nozzle readings" subtitle="Closing ≥ opening" />
            <div className="overflow-hidden rounded-card border border-border-soft bg-surface">
              <InteractiveTable
                bare
                dense
                columns={nozzleColumns}
                rows={fuel.rows}
                rowKey={(r) => r.nozzleId}
                totalRow={{
                  label: 'Total',
                  derive: false,
                  values: { testing: shownTesting, litres: shownVolume },
                  units: { testing: fuel.unit, litres: fuel.unit },
                }}
              />
            </div>
            {anyInvalid && (
              <CloseNote tone="danger">
                One or more closing readings are below their opening reading. Fix the highlighted
                fields before saving.
              </CloseNote>
            )}
          </section>

          {/* 2. Card / UPI — only the POS terminals assigned to THIS DU are
             shown (an attendant isn't aware of machines that weren't handed to
             them; shift-wide / other-DU machines are reconciled at shift close). */}
          <section className="flex flex-col gap-2" aria-label="Card and UPI">
            <SectionHeader
              title="Card and UPI"
              subtitle={hasTerminals ? 'Batch totals per machine' : undefined}
            />
            {hasTerminals ? (
              <div className="flex flex-col gap-2">
                {duTerminals.map((t: any) => (
                  <div
                    key={t.terminalId}
                    className="flex flex-wrap items-end gap-3 rounded-input border border-border-soft bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-[140px] flex-1 text-[13px] font-semibold text-ink-strong">
                      {t.label}
                      {t.provider && (
                        <span className="font-normal text-ink-muted"> · {t.provider}</span>
                      )}
                    </div>
                    {t.supportsCard && (
                      <div className="flex flex-col gap-0.5">
                        <FieldLabel htmlFor={`tc-${t.terminalId}`}>Card (₹)</FieldLabel>
                        <Input
                          id={`tc-${t.terminalId}`}
                          inputSize="sm"
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0"
                          className="w-32 text-right font-mono"
                          {...register(`terminalCard.${t.terminalId}`)}
                        />
                      </div>
                    )}
                    {t.supportsUpi && (
                      <div className="flex flex-col gap-0.5">
                        <FieldLabel htmlFor={`tu-${t.terminalId}`}>UPI (₹)</FieldLabel>
                        <Input
                          id={`tu-${t.terminalId}`}
                          inputSize="sm"
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0"
                          className="w-32 text-right font-mono"
                          {...register(`terminalUpi.${t.terminalId}`)}
                        />
                      </div>
                    )}
                  </div>
                ))}
                <dl className="flex flex-col gap-1 px-1">
                  <ReconLine
                    muted
                    label="Batch totals"
                    value={`Card ${formatMoney(terminalCardTotal)} · UPI ${formatMoney(terminalUpiTotal)}`}
                  />
                </dl>
              </div>
            ) : aggregateAllowed ? (
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <FieldLabel htmlFor="handover-card">Card total (₹)</FieldLabel>
                    <Input
                      id="handover-card"
                      inputSize="sm"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      className="text-right font-mono"
                      {...register('cardHandedOver')}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <FieldLabel htmlFor="handover-upi">UPI total (₹)</FieldLabel>
                    <Input
                      id="handover-upi"
                      inputSize="sm"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      className="text-right font-mono"
                      {...register('upiHandedOver')}
                    />
                  </div>
                </div>
                <span className="text-[12px] text-ink-muted">
                  One total each, as no payment terminal is configured.
                </span>
              </div>
            ) : (
              <CloseNote tone="neutral">
                No payment terminal is assigned to this dispenser. Card and UPI are recorded against
                an assigned terminal.
              </CloseNote>
            )}
          </section>

          {/* 3. Customer sales (on-account fuel) for this DU */}
          <section className="flex flex-col gap-2" aria-label="Customer sales">
            <div className="flex items-center gap-1.5 px-0.5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                Customer sales
              </h2>
              <InfoTip label="About customer sales">
                Fuel billed to a customer's account (Credit / Fleet / Regular receivable) or paid by
                an OMC fleet card (settled to the CMS account — not a receivable). Each line is
                recorded immediately; the fuel is already metered, so it sits on the declared side.
              </InfoTip>
              <span className="text-[12px] text-ink-muted">Receivables, not cash</span>
              {creditTotal + omcTotal > 0 && (
                <span className="ml-auto font-mono text-[13px] text-ink-strong">
                  {formatMoney(creditTotal + omcTotal)}
                </span>
              )}
            </div>

            {volumeOverages.length > 0 && (
              <CloseNote tone="warning">
                Credit quantity exceeds metered volume for{' '}
                {volumeOverages
                  .map(
                    (o) =>
                      `${o.name} (${formatQuantity(o.lit, o.unit)} billed vs ${formatQuantity(o.metered, o.unit)} metered)`,
                  )
                  .join(', ')}
                . Check the readings or the credit quantities.
              </CloseNote>
            )}

            {creditGroups.map((g) => (
              <SaleLines
                key={g.type}
                title={g.label}
                total={g.subtotal}
                lines={g.lines}
                busy={ccBusy}
                voidLabel="Void this credit sale"
                emptyName="Customer"
                onVoid={(id) => runTask(removeCreditLine(id), 'Could not void the credit sale.')}
              />
            ))}
            {omcLines.length > 0 && (
              <SaleLines
                title="OMC card · CMS"
                total={omcTotal}
                lines={omcLines}
                busy={ccBusy}
                voidLabel="Void this OMC card sale"
                emptyName="OMC card (no customer)"
                onVoid={(id) => runTask(removeOmcLine(id), 'Could not void the OMC card sale.')}
              />
            )}
            {creditGroups.length === 0 && omcLines.length === 0 && !ccOpen && (
              <p className="text-[12px] text-ink-muted">None this shift.</p>
            )}

            {!ccOpen ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                leftIcon={<Icon name="plus" size="xs" />}
                onClick={() => setCcOpen(true)}
              >
                Add customer sale
              </Button>
            ) : (
              // The picker needs the customers and vehicles: a failed load says
              // so, with Retry, rather than offering an empty list.
              <DataSection
                title="customers and vehicles"
                query={[customersQ, vehiclesQ]}
                shape="bare"
                placeholderHeight={160}
                enabled
              >
                <div className="flex flex-col gap-3 rounded-input border border-border-soft bg-surface p-3">
                  {/* Channel: station receivable (Credit) vs OMC fleet card (→ CMS) */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-ink-muted">Payment channel</span>
                    <SegmentedControl
                      aria-label="Payment channel"
                      value={ccChannel}
                      onChange={setCcChannel}
                      options={[
                        { value: 'credit', label: 'Credit (receivable)' },
                        { value: 'omc', label: 'OMC card → CMS' },
                      ]}
                    />
                    {ccChannel === 'omc' && (
                      <span className="text-[12px] text-ink-muted">
                        Settled to CMS by the Oil Company — not a receivable. Customer is optional.
                      </span>
                    )}
                  </div>

                  {/* Combined picker: customer name OR vehicle number (cached, client-side) */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-ink-muted">
                      Customer or vehicle{ccChannel === 'omc' ? ' (optional)' : ''}
                    </span>
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
                      <span className="text-[12px] text-ink-muted">
                        Available credit {formatMoney(ccAvailable)}
                      </span>
                    )}
                  </div>

                  {(ccCustomerId || ccChannel === 'omc') && (
                    <>
                      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <FieldLabel htmlFor="cc-fuel">Fuel</FieldLabel>
                          <Select
                            id="cc-fuel"
                            inputSize="sm"
                            value={ccProductId}
                            onChange={(e) => handleCcProductChange(e.target.value)}
                            disabled={ccBusy}
                          >
                            <option value="">Select fuel</option>
                            {duProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {p.code ? ` (${p.code})` : ''}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <FieldLabel htmlFor="cc-qty">
                            Qty (L){ccPrice ? ` · ₹${ccPrice}/L` : ''}
                          </FieldLabel>
                          <Input
                            id="cc-qty"
                            inputSize="sm"
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="0"
                            className="text-right font-mono"
                            value={ccQty}
                            onChange={(e) => handleCcQtyChange(e.target.value)}
                            disabled={ccBusy}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <FieldLabel htmlFor="cc-amount">Amount (₹)</FieldLabel>
                          <Input
                            id="cc-amount"
                            inputSize="sm"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            name="ccAmount"
                            aria-label="Customer sale amount"
                            className="text-right font-mono font-semibold"
                            value={ccAmount}
                            onChange={(e) => handleCcAmountChange(e.target.value)}
                            disabled={ccBusy}
                          />
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <FieldLabel htmlFor="cc-notes">
                          Remarks (driver, slip no., notes)
                        </FieldLabel>
                        <Input
                          id="cc-notes"
                          inputSize="sm"
                          value={ccNotes}
                          onChange={(e) => setCcNotes(e.target.value)}
                          disabled={ccBusy}
                          placeholder="e.g. driver name / phone / slip ref"
                        />
                      </div>
                      {ccChannel === 'credit' && ccExceeds && (
                        <CloseNote tone="warning">
                          Exceeds available credit
                          {ccAvailable != null ? ` (${formatMoney(ccAvailable)})` : ''}. You can
                          still record it.
                        </CloseNote>
                      )}
                    </>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leftIcon={<Icon name="plus" size="xs" />}
                      onClick={addCreditLine}
                      disabled={
                        (ccChannel === 'credit' && !ccCustomerId) || !(Number(ccAmount) > 0)
                      }
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
              </DataSection>
            )}
          </section>

          {/* 4. Cash handed over, and drops */}
          <section className="flex flex-col gap-2" aria-label="Cash">
            <SectionHeader title="Cash" subtitle="Count includes the float" />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <FieldLabel htmlFor="handover-cash">Cash handed over (₹)</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="handover-cash"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    className="flex-1 text-right font-mono"
                    {...register('cashHandedOver')}
                  />
                  <CashCountPopover
                    breakdown={cashBreakdown}
                    onBreakdownChange={setCashBreakdown}
                    onApply={(t) =>
                      setValue('cashHandedOver', t, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    currentValue={Number(formCash) || 0}
                    title="Count handover cash by denomination"
                    validateCount={denominationCountError}
                  />
                </div>
                <FieldError message={errors.cashHandedOver?.message} />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[12px] font-medium text-ink-muted">Credit chits total</span>
                <span
                  className="flex h-9 items-center justify-end rounded-input border border-dashed border-border-strong bg-surface-alt px-3 font-mono text-[13px] text-ink-default"
                  title="From the credit sales above"
                >
                  {formatMoney(creditTotal)}
                </span>
                <span className="text-[12px] text-ink-muted">From the credit sales above</span>
              </div>
            </div>
            {/* Most handovers have no mid-shift drop, so the field sits on its own
                row behind "+ Add cash drop" (#304, #324). Removing it zeroes the
                value so a hidden amount can never skew the variance. Drops become
                their own records in #589. */}
            {!hasDrops ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                leftIcon={<Icon name="plus" size="xs" />}
                onClick={() => setHasDrops(true)}
              >
                Add cash drop
              </Button>
            ) : (
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="handover-cash-drops">Cash drops (₹)</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="handover-cash-drops"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    autoFocus={!existingHandover}
                    className="w-[calc(50%-6px)] text-right font-mono"
                    {...register('cashDrops')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    iconOnly
                    aria-label="Remove cash drop"
                    title="Remove cash drop"
                    leftIcon={<Icon name="x" size="sm" />}
                    onClick={() => {
                      setHasDrops(false);
                      setValue('cashDrops', '', {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                  />
                </div>
                <span className="text-[12px] text-ink-muted">
                  Cash taken from this pouch mid-shift (e.g. to the safe).
                </span>
                <FieldError message={errors.cashDrops?.message} />
              </div>
            )}
          </section>

          {/* 5. Reconciliation: expected = float + fuel cash + product cash − drops */}
          <section className="flex flex-col gap-2" aria-label="Reconciliation">
            <SectionHeader
              title="Reconciliation"
              subtitle={acceptedResult ? 'Saved · the server’s figures' : 'Live preview'}
            />
            <dl className="flex flex-col gap-1.5 rounded-card border border-border-soft bg-surface px-4 py-3">
              <ReconLine label="Fuel sales" value={formatMoney(recon.fuelSales)} />
              <ReconLine
                label={
                  <>
                    Product sales (cash)
                    {/* Edit opens the recorded sale: it waits for the shift's
                        product sales, and says so if they fail to load. */}
                    <DataSection
                      title="product sales"
                      query={[productHandoversQ, productBilledQ]}
                      shape="bare"
                      placeholderHeight={24}
                      enabled
                      className="inline-flex"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 px-1.5 text-brand"
                        onClick={() => setProductSale((p) => ({ open: true, token: p.token + 1 }))}
                      >
                        Edit
                        <span className="sr-only"> {userName}'s product sales</span>
                      </Button>
                    </DataSection>
                  </>
                }
                value={plus(recon.productCash)}
              />
              {productNonCash > 0 && (
                <p className="text-[12px] text-ink-muted">
                  Product sales on card / UPI ({formatMoney(productNonCash)}) are not drawer cash.
                </p>
              )}
              <ReconLine label="Card · UPI" value={minus(recon.cardUpi)} />
              <ReconLine label="Credit · OMC card" value={minus(recon.creditOmc)} />
              <ReconLine total label="Cash sales" value={formatMoney(recon.cashSales)} />
              <ReconLine label="Opening float" value={plus(recon.openingFloat)} />
              <ReconLine label="Cash drops" value={minus(recon.drops)} />
              <ReconLine total label="Expected in drawer" value={formatMoney(recon.expected)} />
              <ReconLine label="Declared cash" value={formatMoney(recon.declaredCash)} />
              <ReconLine
                muted
                label="Declared total (cash + card + UPI + credit + OMC)"
                value={formatMoney(recon.declaredTotal)}
              />
              <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-1.5 text-[13px] font-semibold text-ink-strong">
                <dt>Variance</dt>
                <dd>
                  <VarianceChip amount={recon.variance} size="md" />
                </dd>
              </div>
            </dl>
            <p className="text-[12px] text-ink-muted">
              Fuel {formatQuantity(shownVolume, fuel.unit, { decimals: 3 })} metered
              {shownTesting > 0
                ? `, ${formatQuantity(shownTesting, fuel.unit)} returned as testing`
                : ''}
              .
            </p>
          </section>
        </Form>
      </Drawer>

      {/* Edit opens the employee's Handover Product Sale (#533) on top. */}
      <HandoverProductSaleDrawer
        key={productSale.token}
        isOpen={productSale.open}
        onClose={() => setProductSale((p) => ({ ...p, open: false }))}
        shiftId={shiftId}
        stationId={stationId}
        employeeId={userId}
        handoverSales={productHandoversQ.data ?? []}
        billed={productBilledQ.data ?? []}
      />

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

/** One group of recorded customer-sale lines, each voidable. */
const SaleLines: React.FC<{
  title: string;
  total: number;
  lines: any[];
  busy: boolean;
  voidLabel: string;
  emptyName: string;
  onVoid: (id: string) => void;
}> = ({ title, total, lines, busy, voidLabel, emptyName, onVoid }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-baseline justify-between px-0.5 text-[12px] font-semibold text-ink-muted">
      <span>{title}</span>
      <span className="font-mono text-ink-strong">{formatMoney(total)}</span>
    </div>
    <ul className="flex flex-col overflow-hidden rounded-input border border-border-soft bg-surface">
      {lines.map((l, idx) => (
        <li
          key={l.id ?? idx}
          className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-2 last:border-b-0"
        >
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink-strong">
              {l.customerName || emptyName}
              {l.vehicleLabel ? ` · ${l.vehicleLabel}` : ''}
            </div>
            <div className="text-[12px] text-ink-muted">
              {l.productName ?? 'Fuel'}
              {l.quantity ? ` · ${formatQuantity(Number(l.quantity), 'L')}` : ''}
              {l.notes ? ` · ${l.notes}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-mono text-[13px] font-semibold text-ink-strong">
              {formatMoney(l.amount)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              className="text-danger-fg"
              disabled={busy}
              title={voidLabel}
              aria-label={voidLabel}
              leftIcon={<Icon name="x" size="xs" />}
              onClick={() => onVoid(l.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  </div>
);
