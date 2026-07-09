import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Drawer } from '../Drawer.js';
import { CloudShiftService, CloudTransactionService } from '../../services/cloud.js';
import { inr } from '../../utils/format.js';

const shiftService = new CloudShiftService();
const transactionService = new CloudTransactionService();

// Define form validation schema using Zod
const handoverFormSchema = z.object({
  cashHandedOver: z.coerce.number().nonnegative('Cash must be non-negative'),
  cardHandedOver: z.coerce.number().nonnegative('Card Swipe total must be non-negative'),
  upiHandedOver: z.coerce.number().nonnegative('UPI QR total must be non-negative'),
  creditHandedOver: z.coerce.number().nonnegative('Credit chits total must be non-negative'),
  nozzleReadings: z.record(z.string().uuid(), z.coerce.number().nonnegative('Reading must be non-negative')),
  nozzleTesting: z.record(z.string().uuid(), z.coerce.number().nonnegative('Testing liters must be non-negative')),
  terminalCard: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
  terminalUpi: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
});

type HandoverFormValues = z.infer<typeof handoverFormSchema>;

interface HandoverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  shiftId: string;
  userId: string;
  userName: string;
  duId: string;
  duCode: string;
  nozzles: any[];
  terminals?: any[];
  /** Credit-eligible (non-prepaid Credit/Fleet) customers, each with currentBalance + creditLimit. */
  customers?: any[];
  /** Combined search: returns vehicles (with their customer) matching a query. */
  searchVehicles?: (q: string) => Promise<any[]>;
  /** Fuel-on-credit lines already recorded for this (attendant, DU). */
  creditSales?: any[];
  /** Walk-in merchandise cash this attendant collected (folds into expected). */
  merchandiseCash?: number;
  /** Walk-in merchandise paid by card/UPI on a terminal (informational; not in cash expected). */
  merchandiseNonCash?: number;
  /** Called after a credit line is added/voided so the parent can refetch status. */
  onCreditChanged?: () => void | Promise<void>;
  existingHandover: any;
  onSaveSuccess: () => void;
}

export const HandoverDrawer: React.FC<HandoverDrawerProps> = ({
  isOpen,
  onClose,
  shiftId,
  userId,
  userName,
  duId,
  duCode,
  nozzles,
  terminals = [],
  customers = [],
  searchVehicles,
  creditSales = [],
  merchandiseCash = 0,
  merchandiseNonCash = 0,
  onCreditChanged,
  existingHandover,
  onSaveSuccess,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<HandoverFormValues>({
    resolver: zodResolver(handoverFormSchema),
    defaultValues: {
      cashHandedOver: 0,
      cardHandedOver: 0,
      upiHandedOver: 0,
      creditHandedOver: 0,
      nozzleReadings: {},
      nozzleTesting: {},
      terminalCard: {},
      terminalUpi: {},
    },
  });

  // Pre-fill form if existing handover is passed.
  //
  // This must run only ONCE per drawer open. Recording an in-drawer credit sale
  // calls onCreditChanged(), which makes the parent refetch shift status and pass
  // fresh `nozzles`/`terminals`/`existingHandover` identities. Without this guard
  // the effect would re-run on that refetch and overwrite the operator's
  // in-progress nozzle/POS/cash entries.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      prefilledRef.current = false;
      return;
    }
    if (prefilledRef.current) return;
    prefilledRef.current = true;

    setError(null);
    if (existingHandover) {
      setValue('cashHandedOver', Number(existingHandover.cashHandedOver ?? 0));
      setValue('cardHandedOver', Number(existingHandover.cardHandedOver ?? 0));
      setValue('upiHandedOver', Number(existingHandover.upiHandedOver ?? 0));
      setValue('creditHandedOver', Number(existingHandover.creditHandedOver ?? 0));
    } else {
      setValue('cashHandedOver', 0);
      setValue('cardHandedOver', 0);
      setValue('upiHandedOver', 0);
      setValue('creditHandedOver', 0);
    }

    // Initialize readings and testing maps
    nozzles.forEach((nz) => {
      setValue(`nozzleReadings.${nz.nozzleId}`, Number(nz.closingReading ?? nz.openingReading ?? 0));
      setValue(`nozzleTesting.${nz.nozzleId}`, 0); // Default testing volume to 0
    });

    // Initialize per-terminal POS batch maps for THIS DU's terminals only
    // (pre-fill from existing entries). Shift-wide / other-DU machines are not
    // shown to the attendant.
    const existingEntries: any[] = existingHandover?.terminalEntries ?? [];
    terminals
      .filter((t: any) => t.duId === duId)
      .forEach((t: any) => {
        const prior = existingEntries.find((e) => e.terminalId === t.terminalId);
        setValue(`terminalCard.${t.terminalId}`, Number(prior?.cardAmount ?? 0));
        setValue(`terminalUpi.${t.terminalId}`, Number(prior?.upiAmount ?? 0));
      });
  }, [isOpen, existingHandover, nozzles, terminals, duId, setValue]);

  // Watch form values reactively for live expected sales and variance computations
  const formValues = watch();
  const formNozzleReadings = formValues.nozzleReadings || {};
  const formNozzleTesting = formValues.nozzleTesting || {};
  const formCash = formValues.cashHandedOver || 0;
  const formCredit = formValues.creditHandedOver || 0;

  // POS terminals assigned to THIS DU (shift-wide / other-DU machines are not
  // shown to the attendant). When present, card/UPI aggregates are derived from
  // the per-terminal batches (single source of truth).
  const duTerminals = terminals.filter((t: any) => t.duId === duId);
  const hasTerminals = duTerminals.length > 0;
  const formTerminalCard = formValues.terminalCard || {};
  const formTerminalUpi = formValues.terminalUpi || {};
  const terminalCardTotal = duTerminals.reduce((sum: number, t: any) => sum + Number(formTerminalCard[t.terminalId] || 0), 0);
  const terminalUpiTotal = duTerminals.reduce((sum: number, t: any) => sum + Number(formTerminalUpi[t.terminalId] || 0), 0);
  const effectiveCard = terminalCardTotal;
  const effectiveUpi = terminalUpiTotal;

  // ---- Fuel-on-credit (credit chits) declared for this (attendant, DU) ----
  const [creditLines, setCreditLines] = useState<any[]>([]);
  const [ccOpen, setCcOpen] = useState(false);
  const [ccQuery, setCcQuery] = useState('');
  const [ccResults, setCcResults] = useState<any[]>([]);
  const [ccSearching, setCcSearching] = useState(false);
  const [ccShowResults, setCcShowResults] = useState(false);
  const [ccCustomerId, setCcCustomerId] = useState('');
  const [ccCustomerName, setCcCustomerName] = useState('');
  const [ccVehicleId, setCcVehicleId] = useState<string | null>(null);
  const [ccVehicleLabel, setCcVehicleLabel] = useState('');
  const [ccProductId, setCcProductId] = useState('');
  const [ccQty, setCcQty] = useState('');
  const [ccPrice, setCcPrice] = useState('');
  const [ccAmount, setCcAmount] = useState('');
  const [ccNotes, setCcNotes] = useState('');
  const [ccBusy, setCcBusy] = useState(false);

  const resetCcRow = () => {
    setCcQuery(''); setCcResults([]); setCcShowResults(false);
    setCcCustomerId(''); setCcCustomerName(''); setCcVehicleId(null); setCcVehicleLabel('');
    setCcProductId(''); setCcQty(''); setCcPrice(''); setCcAmount(''); setCcNotes('');
  };
  useEffect(() => {
    if (isOpen) { setCreditLines(creditSales ?? []); setCcOpen(false); resetCcRow(); }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fuel products dispensed at this DU (from its nozzles).
  const duProducts = Array.from(
    new Map(
      nozzles
        .filter((n: any) => n.productId)
        .map((n: any) => [n.productId, { id: n.productId, name: n.productName ?? 'Fuel', code: n.productCode ?? '', price: Number(n.unitPrice || 0) }]),
    ).values(),
  );

  // Combined search: vehicle registration OR customer name. Vehicles autofill the
  // customer (+ product/price when the vehicle's fuel is dispensed at this DU).
  useEffect(() => {
    if (!ccOpen || ccCustomerId) { setCcShowResults(false); return; }
    const q = ccQuery.trim();
    if (!q) { setCcResults([]); setCcShowResults(false); return; }
    let active = true;
    setCcSearching(true);
    const t = window.setTimeout(async () => {
      let vehicles: any[] = [];
      try { vehicles = searchVehicles ? await searchVehicles(q) : []; } catch { vehicles = []; }
      vehicles = vehicles.filter((v: any) => !v.isPrepaid && v.customerType !== 'Regular');
      const ql = q.toLowerCase();
      const custMatches = (customers || []).filter((c: any) => (c.name || '').toLowerCase().includes(ql));
      if (!active) return;
      setCcResults([
        ...vehicles.map((v: any) => ({ kind: 'vehicle', ...v })),
        ...custMatches.map((c: any) => ({ kind: 'customer', id: c.id, customerId: c.id, customerName: c.name, customerType: c.customerType })),
      ]);
      setCcShowResults(true);
      setCcSearching(false);
    }, 200);
    return () => { active = false; window.clearTimeout(t); };
  }, [ccQuery, ccOpen, ccCustomerId, searchVehicles, customers]);

  const selectCcResult = (r: any) => {
    setCcCustomerId(r.customerId);
    setCcCustomerName(r.customerName);
    if (r.kind === 'vehicle') {
      setCcVehicleId(r.id);
      setCcVehicleLabel(r.registrationNumber);
      setCcQuery(r.registrationNumber);
      const match = duProducts.find((p) => p.id === r.defaultProductId);
      if (match) {
        setCcProductId(match.id);
        if (match.price > 0) setCcPrice(match.price.toFixed(2));
      }
    } else {
      setCcVehicleId(null);
      setCcVehicleLabel('');
      setCcQuery(r.customerName);
    }
    setCcShowResults(false);
  };

  const ccSelectedCustomer = customers.find((c: any) => c.id === ccCustomerId);
  const ccLimit = Number(ccSelectedCustomer?.creditLimit ?? 0);
  const ccBalance = Number(ccSelectedCustomer?.currentBalance ?? 0);
  const ccAvailable = ccLimit > 0 ? ccLimit - ccBalance : null;
  const ccExceeds = ccAvailable != null && Number(ccAmount) > ccAvailable;

  const handleCcProductChange = (pid: string) => {
    setCcProductId(pid);
    // Price is fixed per nozzle — keep it internal (drives qty↔amount), no manual entry.
    const p = duProducts.find((x) => x.id === pid);
    const price = p && p.price > 0 ? p.price : 0;
    setCcPrice(price > 0 ? price.toFixed(2) : '');
    const q = Number(ccQty);
    if (q > 0 && price > 0) setCcAmount((q * price).toFixed(2));
  };
  const handleCcQtyChange = (v: string) => {
    setCcQty(v);
    const q = Number(v); const pr = Number(ccPrice);
    if (q > 0 && pr > 0) setCcAmount((q * pr).toFixed(2));
  };
  const handleCcAmountChange = (v: string) => {
    setCcAmount(v);
    const a = Number(v); const pr = Number(ccPrice);
    if (a > 0 && pr > 0) setCcQty((a / pr).toFixed(3));
  };

  const addCreditLine = async () => {
    setError(null);
    const amt = Number(ccAmount);
    if (!ccCustomerId) { setError('Search and select a customer or vehicle for the credit sale.'); return; }
    if (!(amt > 0)) { setError('Enter a valid credit amount.'); return; }
    try {
      setCcBusy(true);
      const entry = await transactionService.recordCollection({
        shiftId,
        customerId: ccCustomerId,
        vehicleId: ccVehicleId,
        productId: ccProductId || null,
        quantity: Number(ccQty) > 0 ? Number(ccQty) : null,
        unitPrice: ccPrice && Number(ccPrice) >= 0 ? Number(ccPrice) : null,
        amount: amt,
        paymentMethod: 'Credit',
        attendantId: userId,
        duId,
        notes: ccNotes || undefined,
      });
      const prod = duProducts.find((p) => p.id === ccProductId);
      setCreditLines((prev) => [...prev, {
        id: entry?.id,
        customerId: ccCustomerId,
        customerName: ccCustomerName || ccSelectedCustomer?.name || 'Customer',
        vehicleId: ccVehicleId,
        vehicleLabel: ccVehicleLabel || null,
        productId: ccProductId || null,
        productName: prod?.name ?? null,
        quantity: Number(ccQty) || null,
        unitPrice: Number(ccPrice) || null,
        amount: amt,
        notes: ccNotes || null,
      }]);
      resetCcRow();
      await onCreditChanged?.();
    } catch (e: any) {
      setError(e.message || 'Failed to add credit sale');
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
      await onCreditChanged?.();
    } catch (e: any) {
      setError(e.message || 'Failed to remove credit sale');
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

  const expectedSales = Math.max(0, totalRawSales - totalTestingDeduction);

  // Fuel-on-credit lines are declared in this section and saved immediately
  // (each is a real receivable). The credit chits total is DERIVED from them and
  // sits on the DECLARED side — the fuel is already metered in the nozzle reading,
  // so credit is NOT added to expected (that would double-count).
  const creditTotal = creditLines.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const totalDeclared = Number(formCash) + Number(effectiveCard) + Number(effectiveUpi) + creditTotal;
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
    meteredByProduct.set(n.productId, (meteredByProduct.get(n.productId) ?? 0) + Math.max(0, n.volume - n.testing));
  }
  const creditLitresByProduct = new Map<string, number>();
  for (const l of creditLines) {
    if (l.productId && l.quantity) creditLitresByProduct.set(l.productId, (creditLitresByProduct.get(l.productId) ?? 0) + Number(l.quantity));
  }
  const volumeOverages = Array.from(creditLitresByProduct.entries())
    .map(([pid, lit]) => ({ name: duProducts.find((p) => p.id === pid)?.name ?? 'Fuel', lit, metered: meteredByProduct.get(pid) ?? 0 }))
    .filter((o) => o.lit > o.metered + 0.001);

  const onSubmit = async (values: HandoverFormValues) => {
    setError(null);

    // Validate reading constraints: closing cannot be less than opening
    for (const nz of calculatedNozzles) {
      if (nz.closing < nz.opening) {
        setError(`Closing reading for nozzle ${nz.nozzleName} (${nz.closing}) cannot be less than opening reading (${nz.opening}).`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const nozzleReadingsPayload = Object.entries(values.nozzleReadings).map(([nozzleId, closingVal]) => ({
        nozzleId,
        closingReading: Number(closingVal),
        testingVolume: Number(values.nozzleTesting?.[nozzleId] ?? 0),
      }));

      const payload = {
        shiftId,
        userId,
        duId,
        cashHandedOver: Number(values.cashHandedOver),
        cardHandedOver: effectiveCard,
        upiHandedOver: effectiveUpi,
        creditHandedOver: creditTotal,
        testingVolume: totalTestingVolume, // aggregate sum of all nozzles testing volumes
        expectedSales,
        varianceAmount: variance,
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

      await shiftService.recordHandover(payload);
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save attendant handover');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Attendant Handover: ${userName} (${duCode})`}
    >
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {error && (
          <div style={{
            backgroundColor: 'var(--state-danger-bg)',
            border: '1px solid var(--border-soft)',
            color: 'var(--state-danger-fg)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            fontWeight: 500,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* 1. Nozzle Readings Section */}
        <div>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
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
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>{nz.nozzleName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {nz.productCode} • <strong>₹{nz.price.toFixed(2)}/L</strong>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Opening</label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-faint)' }}>{nz.opening.toFixed(3)}</span>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Closing Rd</label>
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
                    <span style={{ color: 'var(--brand-danger)', fontSize: '10px', display: 'block', marginTop: '2px' }}>
                      Must be ≥ {nz.opening.toFixed(3)}
                    </span>
                  ) : errors.nozzleReadings?.[nz.nozzleId] ? (
                    <span style={{ color: 'var(--brand-danger)', fontSize: '10px', display: 'block', marginTop: '2px' }}>
                      {errors.nozzleReadings[nz.nozzleId]?.message || 'Invalid'}
                    </span>
                  ) : null}
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Testing (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
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
                    <span style={{ color: 'var(--brand-danger)', fontSize: '10px', display: 'block', marginTop: '2px' }}>
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
        {hasTerminals && (
          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
              2. Card / UPI Collections
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>
                      {t.label}
                      {t.provider && <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}> · {t.provider}</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: both ? '1fr 1fr' : '1fr', gap: '8px' }}>
                      {t.supportsCard && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Card (₹)</label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            {...register(`terminalCard.${t.terminalId}`)}
                            style={{ height: '30px', padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontFamily: 'var(--font-mono)', fontSize: '12px', textAlign: 'right' }}
                          />
                        </div>
                      )}
                      {t.supportsUpi && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>UPI (₹)</label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            {...register(`terminalUpi.${t.terminalId}`)}
                            style={{ height: '30px', padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontFamily: 'var(--font-mono)', fontSize: '12px', textAlign: 'right' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', paddingTop: '2px' }}>
                <span>POS totals (derived)</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>
                  Card ₹{terminalCardTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} · UPI ₹{terminalUpiTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* 3. Fuel-on-credit sales (credit chits) for this DU */}
        <div>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>3. Fuel-on-Credit Sales</span>
            {creditTotal > 0 && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>₹{creditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>}
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '10px' }}>
            Fuel dispensed at this pump and billed to a customer's account. Each line is recorded immediately and feeds the credit chits total below.
          </p>

          {volumeOverages.length > 0 && (
            <div style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '8px 10px', fontSize: '11px', marginBottom: '10px' }}>
              Credit litres exceed metered volume for {volumeOverages.map((o) => `${o.name} (${o.lit.toLocaleString('en-IN')} L billed vs ${o.metered.toLocaleString('en-IN')} L metered)`).join(', ')}. Check the readings or the credit quantities.
            </div>
          )}

          {creditLines.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {creditLines.map((l, idx) => (
                <div key={l.id ?? idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '8px 10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.customerName}{l.vehicleLabel ? ` · ${l.vehicleLabel}` : ''}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {l.productName ?? 'Fuel'}{l.quantity ? ` · ${Number(l.quantity).toLocaleString('en-IN')} L` : ''}{l.notes ? ` · ${l.notes}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>₹{Number(l.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    <button type="button" onClick={() => removeCreditLine(l.id)} disabled={ccBusy} title="Void this credit sale" style={{ background: 'transparent', border: 'none', color: 'var(--brand-danger)', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!ccOpen ? (
            <button type="button" onClick={() => setCcOpen(true)} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
              + Add credit sale
            </button>
          ) : (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Combined search: customer name OR vehicle number */}
              {!ccCustomerId ? (
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Search customer name or vehicle number</label>
                  <input
                    type="text"
                    value={ccQuery}
                    autoFocus
                    onChange={(e) => setCcQuery(e.target.value)}
                    onFocus={() => ccResults.length > 0 && setCcShowResults(true)}
                    placeholder="e.g. Star Logistics or KA01AB1234"
                    style={{ height: '30px', padding: '0 8px', width: '100%', minWidth: 0, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontSize: '12px' }}
                  />
                  {ccShowResults && ccResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px', maxHeight: '200px', overflowY: 'auto', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 20 }}>
                      {ccResults.map((r, i) => (
                        <div
                          key={(r.kind === 'vehicle' ? 'v' : 'c') + (r.id ?? i)}
                          onMouseDown={(e) => { e.preventDefault(); selectCcResult(r); }}
                          style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: i === ccResults.length - 1 ? 'none' : '1px solid var(--border-soft)', fontSize: '12px' }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--text-default)' }}>
                            {r.kind === 'vehicle' ? r.registrationNumber : r.customerName}
                            <span style={{ marginLeft: '6px', fontSize: '9px', fontWeight: 600, color: r.kind === 'vehicle' ? 'var(--state-info-fg)' : 'var(--text-muted)', textTransform: 'uppercase' }}>{r.kind}</span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', marginTop: '1px' }}>
                            {r.kind === 'vehicle' ? `${r.customerName} · ${r.vehicleType ?? ''}${r.defaultProductName ? ` · ${r.defaultProductName}` : ''}` : r.customerType}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {ccShowResults && !ccSearching && ccResults.length === 0 && ccQuery.trim() && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 2px' }}>No credit customer or vehicle matches "{ccQuery}".</div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-surface-alt)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-default)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ccCustomerName}{ccVehicleLabel ? ` · ${ccVehicleLabel}` : ''}
                    </div>
                    {ccAvailable != null && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Available credit {inr(ccAvailable)}</div>}
                  </div>
                  <button type="button" onClick={resetCcRow} disabled={ccBusy} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}>Change</button>
                </div>
              )}

              {ccCustomerId && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Fuel</label>
                      <select value={ccProductId} onChange={(e) => handleCcProductChange(e.target.value)} disabled={ccBusy} style={{ height: '30px', padding: '0 6px', width: '100%', minWidth: 0, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
                        <option value="">-- Fuel --</option>
                        {duProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Qty (L){ccPrice ? ` · ₹${ccPrice}/L` : ''}</label>
                      <input type="number" step="0.001" min="0" value={ccQty} onChange={(e) => handleCcQtyChange(e.target.value)} disabled={ccBusy} style={{ height: '30px', padding: '0 6px', width: '100%', minWidth: 0, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontFamily: 'var(--font-mono)', fontSize: '12px', textAlign: 'right' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Amount (₹)</label>
                      <input type="number" step="0.01" min="0" value={ccAmount} onChange={(e) => handleCcAmountChange(e.target.value)} disabled={ccBusy} style={{ height: '30px', padding: '0 6px', width: '100%', minWidth: 0, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontFamily: 'var(--font-mono)', fontSize: '12px', textAlign: 'right', fontWeight: 600 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Remarks (driver, slip no., notes)</label>
                    <input type="text" value={ccNotes} onChange={(e) => setCcNotes(e.target.value)} disabled={ccBusy} placeholder="e.g. driver name / phone / slip ref" style={{ height: '30px', padding: '0 8px', width: '100%', minWidth: 0, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontSize: '12px' }} />
                  </div>
                  {ccExceeds && (
                    <div style={{ fontSize: '11px', color: 'var(--state-warning-fg)' }}>
                      Exceeds available credit{ccAvailable != null ? ` (${inr(ccAvailable)})` : ''} — you can still record it.
                    </div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={addCreditLine} disabled={ccBusy || !ccCustomerId || !(Number(ccAmount) > 0)} className="btn btn-primary btn-sm">
                  {ccBusy ? 'Saving…' : '+ Add credit sale'}
                </button>
                <button type="button" onClick={() => { resetCcRow(); setCcOpen(false); }} disabled={ccBusy} className="btn btn-secondary btn-sm">Done</button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Cash & credit chits total */}
        <div>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            4. Cash Deposit
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>Cash Handed Over (₹)</label>
              <input
                type="number"
                step="any"
                min="0"
                {...register('cashHandedOver')}
                style={{ height: '32px', padding: '0 8px', width: '100%', minWidth: 0, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
              />
              {errors.cashHandedOver && (
                <span style={{ color: 'var(--brand-danger)', fontSize: '10px' }}>{errors.cashHandedOver.message}</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>Credit Chits Total (₹)</label>
              <div
                style={{ height: '32px', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-input)', fontFamily: 'var(--font-mono)', fontSize: '13px', backgroundColor: 'var(--bg-surface-alt)', color: 'var(--text-default)' }}
                title="Auto-derived from the fuel-on-credit sales above"
              >
                ₹{creditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>Auto from credit sales above</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Derived Fuel Volume:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{totalVolumeSold.toFixed(3)} Liters</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Testing/Calibration Volume:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{totalTestingVolume.toFixed(1)} Liters</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Expected Fuel Sales Value:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{expectedSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </div>
          {(merchandiseCashNum > 0 || merchandiseNonCashNum > 0) && (
            <>
              {merchandiseCashNum > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span>+ Merchandise sold (cash):</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{merchandiseCashNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </div>
              )}
              {merchandiseNonCashNum > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-faint)' }}>
                  <span>Merchandise (card/UPI, on terminal):</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>₹{merchandiseNonCashNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
                <span>Total Expected:</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{expectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </div>
            </>
          )}
          {creditTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
              <span>of which on credit (chits):</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{creditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Declared Deposit Sum:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{totalDeclared.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
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
              color: variance === 0 ? 'var(--state-success-fg)' : variance > 0 ? 'var(--brand-warning)' : 'var(--brand-danger)',
            }}
          >
            <span>Handover Variance:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {variance > 0 ? '+' : ''}₹{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              {variance === 0 ? ' (Balanced)' : variance > 0 ? ' (Surplus)' : ' (Shortage)'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        {calculatedNozzles.some((n) => n.closing < n.opening) && (
          <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '8px 10px', fontSize: '11px' }}>
            One or more closing readings are below their opening reading. Fix the highlighted fields before saving.
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            type="submit"
            disabled={submitting || calculatedNozzles.some((n) => n.closing < n.opening)}
            style={{
              flex: 1,
              height: '36px',
              backgroundColor: 'var(--brand-primary)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: submitting || calculatedNozzles.some((n) => n.closing < n.opening) ? 'not-allowed' : 'pointer',
              opacity: submitting || calculatedNozzles.some((n) => n.closing < n.opening) ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving...' : 'Save Handover & Readings'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              height: '36px',
              backgroundColor: 'var(--bg-surface-alt)',
              color: 'var(--text-default)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Drawer>
  );
};
