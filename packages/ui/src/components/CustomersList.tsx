import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudTransactionService } from '../services/cloud.js';
import { useCustomers, useShiftStatus, useProducts, useInvalidateOperational, useCollections, useCreditSales, useAllVehicles } from '../query/hooks.js';
import { User, Users, CreditCard, Plus, Edit, Truck, Trash2, Search, Wallet, HelpCircle } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { CollectionEntryForm } from './transactions/CollectionEntryForm.js';
import { LedgerView } from './ledger/LedgerView.js';
import { DataTable } from './primitives/DataTable.js';
import { Combobox } from './primitives/Combobox.js';
import { Checkbox } from './primitives/Toggle.js';
import { Field, TextInput, MoneyInput, Textarea, Select } from './primitives/Field.js';
import { inr } from '../utils/format.js';
import { Tabs } from './primitives/Tabs.js';
import { PageLayout } from './primitives/PageLayout.js';
import { useConfirm } from './primitives/ConfirmDialog.js';
import { useToast } from './primitives/ToastProvider.js';
import { Panel, Button, StatusChip, Chip, KpiStrip, KpiTile, EmptyState } from '../pump-ds/index.js';
import type { NavIntent } from './AppShell.js';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerCreateSchema, resolveBusinessDate, type CollectionEntryFormValues } from '@pump/shared';

const transactionService = new CloudTransactionService();

interface CustomersListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
  /** Optional deep-link intent (focus a customer, open a drawer). */
  intent?: NavIntent | null;
  /** Called once the intent has been handled so the parent can clear it. */
  onIntentConsumed?: () => void;
}

type TabType = 'transactions' | 'sales' | 'registry' | 'vehicles';

/** Account-type chip tone. */
const typeTone = (t: string): 'info' | 'warning' | 'neutral' => (t === 'Fleet' ? 'info' : t === 'Credit' ? 'warning' : 'neutral');

const buildCustomerColumns = (openLedger: (c: any) => void, openEdit: (c: any) => void, showPrepaid: boolean): ColumnDef<any, any>[] => {
  const cols: ColumnDef<any, any>[] = [
  {
    accessorKey: 'name',
    header: 'Customer Name',
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={14} style={{ color: 'var(--text-muted)' }} />
          <div>
            <button type="button" onClick={() => openLedger(c)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>{c.name}</button>
            {c.metadata?.tradeName && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{c.metadata.tradeName}</div>}
            {c.metadata?.gstin && <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px' }}>GSTIN {c.metadata.gstin}</div>}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'customerType',
    header: 'Account Type',
    cell: ({ row }) => {
      const c = row.original;
      const t = c.customerType as string;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <Chip tone={typeTone(t)} size="xs">{t}</Chip>
          {t === 'Fleet' && c.fleetCode && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.fleetCode}</span>}
        </div>
      );
    },
  },
  { accessorKey: 'phone', header: 'Phone', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{(getValue() as string) || '—'}</span> },
  {
    accessorKey: 'creditLimit',
    header: 'Credit Limit',
    cell: ({ row }) => {
      const limit = Number(row.original.creditLimit || 0);
      const balance = Number(row.original.currentBalance || 0);
      if (limit <= 0) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const pct = Math.min(100, (balance / limit) * 100);
      const barColor = balance > limit ? 'var(--brand-danger)' : balance >= limit * 0.75 ? 'var(--brand-warning)' : 'var(--brand-primary)';
      return (
        <div style={{ width: '110px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{inr(limit)}</span>
          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--bg-surface-alt)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor, borderRadius: '999px' }} />
          </div>
        </div>
      );
    },
  },
  ];

  if (showPrepaid) {
    cols.push(
      {
        accessorKey: 'isPrepaid',
        header: 'Prepaid',
        cell: ({ getValue }) => (getValue() ? <Chip tone="info" size="xs">Enabled</Chip> : <span style={{ color: 'var(--text-faint)' }}>—</span>),
      },
      {
        accessorKey: 'prepaidBalance',
        header: 'Prepaid Balance',
        cell: ({ row }) => {
          const c = row.original;
          return <span style={{ fontWeight: 700, color: c.isPrepaid ? 'var(--state-success-fg)' : 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{inr(c.prepaidBalance || 0)}</span>;
        },
      },
    );
  }

  cols.push(
  {
    accessorKey: 'currentBalance',
    header: 'Outstanding',
    cell: ({ row }) => {
      const limit = Number(row.original.creditLimit || 0);
      const balance = Number(row.original.currentBalance || 0);
      const color = limit > 0 && balance > limit ? 'var(--brand-danger)' : balance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
      return <span style={{ fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{inr(balance)}</span>;
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => <StatusChip status={getValue() ? 'active' : 'inactive'} size="xs" label={getValue() ? 'Active' : 'Suspended'} />,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <button onClick={() => openEdit(row.original)} title="Edit customer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
        <Edit size={14} />
      </button>
    ),
  },
  );

  return cols;
};

/** Payment-method chip tone. */
const methodTone = (m: string): 'brand' | 'info' | 'warning' | 'neutral' =>
  m === 'UPI' ? 'brand' : m === 'Card' || m === 'BankTransfer' ? 'info' : m === 'Credit' ? 'warning' : 'neutral';

const methodLabel = (m: string): string => (m === 'BankTransfer' ? 'Bank' : m);

const buildCollectionColumns = (): ColumnDef<any, any>[] => [
  {
    accessorKey: 'businessDate',
    header: 'Date',
    cell: ({ row }) => {
      const c = row.original;
      const d = c.businessDate ? new Date(c.businessDate) : (c.createdAt ? new Date(c.createdAt) : null);
      return <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}</span>;
    },
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) || 'Walk-in Customer'}</span>,
  },
  {
    accessorKey: 'paymentMethod',
    header: 'Method',
    cell: ({ getValue }) => {
      const m = (getValue() as string) || '';
      return m ? <Chip tone={methodTone(m)} size="xs">{methodLabel(m)}</Chip> : <span style={{ color: 'var(--text-muted)' }}>-</span>;
    },
  },
  {
    accessorKey: 'notes',
    header: 'Notes',
    cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) || '-'}</span>,
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ getValue }) => <span style={{ fontWeight: 700, color: 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>{inr(Number(getValue() || 0))}</span>,
  },
];

const buildCreditSaleColumns = (): ColumnDef<any, any>[] => [
  {
    accessorKey: 'businessDate',
    header: 'Date',
    cell: ({ row }) => {
      const s = row.original;
      const d = s.businessDate ? new Date(s.businessDate) : (s.createdAt ? new Date(s.createdAt) : null);
      return <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}</span>;
    },
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) || 'Unknown'}</span>,
  },
  {
    accessorKey: 'productName',
    header: 'Product',
    cell: ({ getValue }) => <span style={{ color: 'var(--text-default)' }}>{(getValue() as string) || 'Merchandise'}</span>,
  },
  {
    accessorKey: 'vehicleReg',
    header: 'Vehicle',
    cell: ({ getValue }) => {
      const r = getValue() as string;
      return r ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>{r}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ getValue }) => {
      const q = getValue();
      return q ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(q).toLocaleString('en-IN')} L</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    },
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ getValue }) => <span style={{ fontWeight: 700, color: 'var(--brand-warning)', fontFamily: 'var(--font-mono)' }}>{inr(Number(getValue() || 0))}</span>,
  },
];

const buildVehicleColumns = (openEdit: (v: any) => void, onDelete: (v: any) => void): ColumnDef<any, any>[] => [
  {
    accessorKey: 'registrationNumber',
    header: 'Registration No.',
    cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{getValue() as string}</span>,
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ row }) => {
      const v = row.original;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{v.customerName || '—'}</span>
          {v.customerType && <Chip tone={typeTone(v.customerType)} size="xs">{v.customerType}</Chip>}
        </div>
      );
    },
  },
  { accessorKey: 'vehicleType', header: 'Vehicle Type', cell: ({ getValue }) => <span style={{ color: 'var(--text-default)' }}>{(getValue() as string) || '-'}</span> },
  {
    id: 'defaultProduct',
    header: 'Default Product',
    cell: ({ row }) => {
      const v = row.original;
      return <span style={{ color: 'var(--text-default)' }}>{v.defaultProductName ? `${v.defaultProductName} (${v.defaultProductCode || ''})` : '-'}</span>;
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => <StatusChip status={getValue() ? 'active' : 'inactive'} size="xs" />,
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{getValue() ? new Date(getValue() as string).toLocaleDateString('en-IN') : '-'}</span>,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div style={{ display: 'flex', gap: '2px' }}>
        <button onClick={() => openEdit(row.original)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }} title="Edit vehicle">
          <Edit size={14} />
        </button>
        <button onClick={() => onDelete(row.original)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand-danger)', padding: '4px' }} title="Delete vehicle">
          <Trash2 size={14} />
        </button>
      </div>
    ),
  },
];

export const CustomersList: React.FC<CustomersListProps> = ({ selectedStation, defaultShiftId, intent, onIntentConsumed }) => {
  const [activeTab, setActiveTab] = useState<TabType>('transactions');

  const stationId = selectedStation?.id ?? null;
  const customersActiveQ = useCustomers(true);
  const customersAllQ = useCustomers(false);
  const statusQ = useShiftStatus(stationId, true);
  const productsQ = useProducts();
  const collectionsQ = useCollections();
  const creditSalesQ = useCreditSales();
  const vehiclesQ = useAllVehicles(false);
  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const customers = customersActiveQ.data ?? [];
  const allCustomers = customersAllQ.data ?? [];
  const allCollections = collectionsQ.data ?? [];
  const anyPrepaid = allCustomers.some((c: any) => c.isPrepaid);
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];
  const fuelProducts = (productsQ.data ?? []).filter((p: any) => p.productType === 'FUEL' && p.isActive);

  // Business date (station-timezone aware) used to bucket "today" collections.
  const stationSettings: any = (selectedStation as any)?.settings || {};
  const todayIso = resolveBusinessDate({ timeZone: stationSettings.timezone, dayStartsAt: stationSettings.business_day_starts_at });
  const monthPrefix = todayIso.slice(0, 7);

  // Collections ledger filters
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionMethod, setCollectionMethod] = useState<string>('all');

  const collectionKpis = useMemo(() => {
    let today = 0, month = 0, todayCount = 0;
    const todayCustomers = new Set<string>();
    for (const c of allCollections) {
      const amt = Number(c.amount || 0);
      const bd: string = c.businessDate || '';
      if (bd === todayIso) { today += amt; todayCount += 1; if (c.customerId) todayCustomers.add(c.customerId); }
      if (bd.startsWith(monthPrefix)) month += amt;
    }
    return { today, month, todayCount, todayCustomers: todayCustomers.size };
  }, [allCollections, todayIso, monthPrefix]);

  const filteredCollections = useMemo(() => {
    const q = collectionSearch.trim().toLowerCase();
    return allCollections.filter((c: any) => {
      if (collectionMethod !== 'all' && c.paymentMethod !== collectionMethod) return false;
      if (q && !((c.customerName || '').toLowerCase().includes(q) || (c.notes || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [allCollections, collectionSearch, collectionMethod]);

  // Credit-sales ledger
  const allCreditSales = creditSalesQ.data ?? [];
  const [salesSearch, setSalesSearch] = useState('');
  const salesKpis = useMemo(() => {
    let today = 0, month = 0, todayCount = 0;
    const custs = new Set<string>();
    for (const s of allCreditSales) {
      const amt = Number(s.amount || 0);
      const bd: string = s.businessDate || '';
      if (bd === todayIso) { today += amt; todayCount += 1; }
      if (bd.startsWith(monthPrefix)) month += amt;
      if (s.customerId) custs.add(s.customerId);
    }
    return { today, month, todayCount, customers: custs.size };
  }, [allCreditSales, todayIso, monthPrefix]);
  const filteredCreditSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    if (!q) return allCreditSales;
    return allCreditSales.filter((s: any) =>
      (s.customerName || '').toLowerCase().includes(q) ||
      (s.vehicleReg || '').toLowerCase().includes(q) ||
      (s.productName || '').toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q));
  }, [allCreditSales, salesSearch]);

  const loading = customersActiveQ.isLoading || statusQ.isLoading;
  const error = (customersActiveQ.error || statusQ.error) as Error | null;

  // CRUD Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCollectionDrawerOpen, setIsCollectionDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null); // null = Creating, object = Editing
  
  // Ledger Drawer States
  const [selectedLedgerCustomer, setSelectedLedgerCustomer] = useState<any | null>(null);
  const [ledgerTransactions, setLedgerTransactions] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const openLedgerDrawer = async (cust: any) => {
    setSelectedLedgerCustomer(cust);
    setLedgerTransactions([]);
    setLoadingLedger(true);
    setLedgerError(null);
    try {
      const data = await transactionService.getCustomerLedger(cust.id);
      setLedgerTransactions(data || []);
    } catch (err: any) {
      setLedgerError(err.message || 'Failed to load ledger history');
    } finally {
      setLoadingLedger(false);
    }
  };

  const [formError, setFormError] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [collectionDefaults, setCollectionDefaults] = useState<Partial<CollectionEntryFormValues>>({});
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);

  // Prepaid top-up state
  const [isTopupDrawerOpen, setIsTopupDrawerOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupPaymentMethod, setTopupPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'BankTransfer'>('Cash');
  const [topupNotes, setTopupNotes] = useState('');
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);

  // Vehicles tab state
  const [vehicleCustomerId, setVehicleCustomerId] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [isVehicleDrawerOpen, setIsVehicleDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    customerId: '',
    registrationNumber: '',
    vehicleType: '',
    defaultProductId: '',
    isActive: true,
  });
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false);

  const allVehicles = vehiclesQ.data ?? [];
  const loadingVehicles = vehiclesQ.isLoading;
  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return allVehicles;
    return allVehicles.filter((v: any) =>
      (v.registrationNumber || '').toLowerCase().includes(q) ||
      (v.customerName || '').toLowerCase().includes(q) ||
      (v.vehicleType || '').toLowerCase().includes(q));
  }, [allVehicles, vehicleSearch]);
  const invalidateVehicles = () => qc.invalidateQueries({ queryKey: ['vehicles'] });

  const resolvePreferredShiftId = (active: any | null, closedList: any[]) => {
    if (defaultShiftId) {
      const matchesActive = active?.id === defaultShiftId;
      const matchesClosed = closedList.some((shift) => shift.id === defaultShiftId);

      if (matchesActive || matchesClosed) {
        return defaultShiftId;
      }
    }

    if (active) {
      return active.id;
    }

    if (closedList.length > 0) {
      return closedList[0].id;
    }

    return '';
  };

  const resetCollectionForm = (customerId?: string) => {
    const preferredShiftId = resolvePreferredShiftId(activeShift, recentClosedShifts);
    setCollectionDefaults({
      targetShiftId: preferredShiftId,
      transactionDate: new Date().toISOString().slice(0, 10),
      customerId: customerId || customers[0]?.id || '',
      amount: undefined as unknown as number,
      paymentMethod: 'Cash',
      notes: '',
    });
    setCollectionSubmitting(false);
    setFormError(null);
  };

  const openCollectionDrawer = (customerId?: string) => {
    resetCollectionForm(customerId);
    setIsCollectionDrawerOpen(true);
  };

  const closeCollectionDrawer = () => {
    setIsCollectionDrawerOpen(false);
    resetCollectionForm();
  };

  // 2. Customer Drawer Form (Create/Edit)
  const {
    register: registerCust,
    handleSubmit: handleSubmitCust,
    setValue: setValueCust,
    watch: watchCust,
    reset: resetCust,
    formState: { errors: custErrors, isSubmitting: drawerSubmitting }
  } = useForm({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: {
      name: '',
      phone: '',
      customerType: 'Regular' as const,
      creditLimit: 50000 as any,
      fleetCode: '',
      isPrepaid: false,
      isActive: true,
      metadata: {
        gstin: '',
        pan: '',
        tradeName: '',
        billingAddress: '',
      }
    }
  });

  const custType = watchCust('customerType');

  // Initialise default selections from query data once it loads.
  useEffect(() => {
    const eligible = allCustomers.filter((c: any) => c.customerType === 'Credit' || c.customerType === 'Fleet');
    setVehicleCustomerId((prev) => prev || eligible[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersAllQ.data]);

  const openCreateVehicleDrawer = () => {
    setEditingVehicle(null);
    setVehicleForm({
      customerId: vehicleCustomerId,
      registrationNumber: '',
      vehicleType: '',
      defaultProductId: '',
      isActive: true,
    });
    setVehicleError(null);
    setIsVehicleDrawerOpen(true);
  };

  const openEditVehicleDrawer = (vehicle: any) => {
    setEditingVehicle(vehicle);
    setVehicleForm({
      customerId: vehicle.customerId,
      registrationNumber: vehicle.registrationNumber || '',
      vehicleType: vehicle.vehicleType || '',
      defaultProductId: vehicle.defaultProductId || '',
      isActive: vehicle.isActive,
    });
    setVehicleError(null);
    setIsVehicleDrawerOpen(true);
  };

  const onSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setVehicleError(null);

    if (!vehicleForm.customerId || !vehicleForm.registrationNumber || !vehicleForm.vehicleType) {
      setVehicleError('Customer, registration number and vehicle type are required.');
      return;
    }

    try {
      setVehicleSubmitting(true);
      const payload = {
        registrationNumber: vehicleForm.registrationNumber.trim().toUpperCase(),
        vehicleType: vehicleForm.vehicleType.trim(),
        defaultProductId: vehicleForm.defaultProductId || null,
        isActive: vehicleForm.isActive,
      };

      if (editingVehicle) {
        await transactionService.updateCustomerVehicle(editingVehicle.id, payload);
      } else {
        await transactionService.createCustomerVehicle(vehicleForm.customerId, payload);
      }

      setIsVehicleDrawerOpen(false);
      invalidateVehicles();
      toast.success(editingVehicle ? 'Vehicle updated.' : 'Vehicle added.');
    } catch (err: any) {
      setVehicleError(err.message || 'Failed to save vehicle');
    } finally {
      setVehicleSubmitting(false);
    }
  };

  const onDeleteVehicle = async (vehicle: any) => {
    if (!(await confirm({ title: 'Delete vehicle?', message: `This will remove vehicle ${vehicle.registrationNumber}.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }

    try {
      await transactionService.deleteCustomerVehicle(vehicle.id);
      invalidateVehicles();
      toast.success('Vehicle deleted.');
    } catch (err: any) {
      setVehicleError(err.message || 'Failed to delete vehicle');
    }
  };

  const onAddCollection = async (values: CollectionEntryFormValues) => {
    setFormError(null);
    if (!values.targetShiftId) {
      setFormError('A shift is required to record this entry.');
      return;
    }

    try {
      setCollectionSubmitting(true);
      await transactionService.recordCollection({
        shiftId: values.targetShiftId,
        customerId: values.customerId || undefined,
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod,
        notes: values.notes || undefined,
        accountId: values.accountId || undefined,
      });

      closeCollectionDrawer();
      invalidateOperational(stationId);
      toast.success('Collection recorded.');
    } catch (err: any) {
      setFormError(err.message || 'Failed to record entry');
    } finally {
      setCollectionSubmitting(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingCustomer(null);
    resetCust({
      name: '',
      phone: '',
      customerType: 'Regular',
      creditLimit: 50000 as any,
      fleetCode: '',
      isPrepaid: false,
      isActive: true,
      metadata: {
        gstin: '',
        pan: '',
        tradeName: '',
        billingAddress: '',
      }
    });
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (cust: any) => {
    setEditingCustomer(cust);
    const meta = cust.metadata || {};
    resetCust({
      name: cust.name,
      phone: cust.phone || '',
      customerType: cust.customerType,
      creditLimit: cust.creditLimit ? Number(cust.creditLimit) : (cust.customerType === 'Regular' ? null : 50000) as any,
      fleetCode: cust.fleetCode || '',
      isPrepaid: Boolean(cust.isPrepaid),
      isActive: cust.isActive,
      metadata: {
        gstin: meta.gstin || '',
        stateCode: meta.stateCode || '',
        pan: meta.pan || '',
        tradeName: meta.tradeName || '',
        billingAddress: meta.billingAddress || '',
      }
    });
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const onSaveCustomer = async (data: any) => {
    setDrawerError(null);
    try {
      const payload = {
        name: data.name,
        phone: data.phone || null,
        customerType: data.customerType,
        creditLimit: (data.customerType === 'Credit' || data.customerType === 'Fleet') && data.creditLimit ? Number(data.creditLimit) : null,
        fleetCode: data.customerType === 'Fleet' ? data.fleetCode : null,
        isPrepaid: Boolean(data.isPrepaid),
        isActive: data.isActive,
        metadata: {
          gstin: data.metadata?.gstin || null,
          stateCode: data.metadata?.stateCode || null,
          pan: data.metadata?.pan || null,
          tradeName: data.metadata?.tradeName || null,
          billingAddress: data.metadata?.billingAddress || null,
        },
      };
      if (editingCustomer) {
        await transactionService.updateCustomer(editingCustomer.id, payload);
      } else {
        await transactionService.createCustomer(payload);
      }

      setIsDrawerOpen(false);
      invalidateOperational(stationId);
      toast.success(editingCustomer ? 'Customer updated.' : 'Customer created.');
    } catch (err: any) {
      setDrawerError(err.message || 'Failed to save customer');
    }
  };

  const openTopupDrawer = () => {
    setTopupAmount('');
    setTopupPaymentMethod('Cash');
    setTopupNotes('');
    setTopupError(null);
    setIsTopupDrawerOpen(true);
  };

  const handleTopupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLedgerCustomer?.id || !topupAmount) {
      return;
    }

    try {
      setTopupSubmitting(true);
      setTopupError(null);
      await transactionService.topupCustomer(selectedLedgerCustomer.id, {
        amount: Number(topupAmount),
        paymentMethod: topupPaymentMethod,
        notes: topupNotes || undefined,
      });

      setIsTopupDrawerOpen(false);
      invalidateOperational(stationId);
      await openLedgerDrawer(selectedLedgerCustomer);
      toast.success('Top-up recorded.');
    } catch (err: any) {
      setTopupError(err.message || 'Failed to record top-up');
    } finally {
      setTopupSubmitting(false);
    }
  };

  // --- deep-link intent (from global search / quick-create) ---
  const handledIntentRef = useRef<NavIntent | null>(null);
  useEffect(() => {
    if (!intent || handledIntentRef.current === intent) return;
    // For a focus intent, wait until the customer list has loaded.
    if (intent.focusCustomerId && customersAllQ.isLoading) return;
    handledIntentRef.current = intent;

    if (intent.open === 'new-customer') {
      openCreateDrawer();
    } else if (intent.open === 'new-collection') {
      openCollectionDrawer();
    }
    if (intent.focusCustomerId) {
      const cust = allCustomers.find((c: any) => c.id === intent.focusCustomerId);
      if (cust) {
        setActiveTab('registry');
        void openLedgerDrawer(cust);
      }
    }
    onIntentConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, allCustomers, customersAllQ.isLoading]);

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px', fontFamily: 'var(--font-sans)' }}>
        Please select a station to view customer accounts.
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Loading customer registries..." />;
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)', fontFamily: 'var(--font-sans)' }}>
        <strong>Error:</strong> {error.message || 'Failed to load customers data'}
      </div>
    );
  }

  return (
    <PageLayout
      title="Customer Fleet Accounts"
      subtitle="Manage fleet customer profiles, credit limits, and record shift collections."
      actions={
        <>
          {activeTab === 'transactions' && (
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={() => openCollectionDrawer()}>Add Collection</Button>
          )}
          {activeTab === 'registry' && (
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openCreateDrawer}>Add Customer</Button>
          )}
          {activeTab === 'vehicles' && (
            <Button variant="primary" size="sm" leftIcon={<Plus />} disabled={!allCustomers.some((c: any) => c.customerType === 'Credit' || c.customerType === 'Fleet')} onClick={openCreateVehicleDrawer}>Add Vehicle</Button>
          )}
        </>
      }
      toolbar={
        <Tabs
          aria-label="Customers"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabType)}
          tabs={[
            { id: 'transactions', label: 'Collections', icon: <Wallet size={15} /> },
            { id: 'sales', label: 'Credit Sales', icon: <CreditCard size={15} /> },
            { id: 'registry', label: 'Customer Registry', icon: <Users size={15} /> },
            { id: 'vehicles', label: 'Vehicles', icon: <Truck size={15} /> },
          ]}
        />
      }
    >
      {/* Tab Contents */}
      <div>
        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* KPI strip — today & month collections at a glance */}
            <KpiStrip columns={4}>
              <KpiTile dot="brand" label="Collected Today" value={inr(collectionKpis.today)} hint={`${collectionKpis.todayCount} ${collectionKpis.todayCount === 1 ? 'entry' : 'entries'}`} />
              <KpiTile dot="success" valueTone="success" label="Collected This Month" value={inr(collectionKpis.month)} />
              <KpiTile dot="info" label="Customers Paid Today" value={String(collectionKpis.todayCustomers)} />
              <KpiTile dot="warning" valueTone="warning" label="Total Receivables" value={inr(customers.reduce((s: number, c: any) => s + Number(c.currentBalance || 0), 0))} hint="Outstanding dues" />
            </KpiStrip>

            {/* Collections ledger */}
            <Panel
              flush
              title="Collections"
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      value={collectionSearch}
                      onChange={(e) => setCollectionSearch(e.target.value)}
                      placeholder="Search customer / note…"
                      style={{ height: '28px', padding: '0 8px 0 26px', width: '200px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                    />
                  </div>
                  <select
                    value={collectionMethod}
                    onChange={(e) => setCollectionMethod(e.target.value)}
                    style={{ height: '28px', padding: '0 6px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                  >
                    <option value="all">All methods</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="UPI">UPI</option>
                    <option value="BankTransfer">Bank</option>
                  </select>
                  <span aria-hidden="true" style={{ width: '1px', height: '18px', background: 'var(--border-soft)', margin: '0 2px' }} />
                  <button
                    type="button"
                    aria-label="Where do collections post?"
                    title={
                      activeShift || recentClosedShifts.length > 0
                        ? `New collections post to ${
                            resolvePreferredShiftId(activeShift, recentClosedShifts) === activeShift?.id
                              ? `${activeShift?.templateName} (active shift)`
                              : recentClosedShifts.find((s) => s.id === resolvePreferredShiftId(activeShift, recentClosedShifts))?.templateName ?? 'the selected shift'
                          }. Cash collections touch the drawer; card / UPI / bank do not.`
                        : 'Open a shift to record collections — cash collections are reconciled against the drawer.'
                    }
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', width: '28px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'help' }}
                  >
                    <HelpCircle size={14} />
                  </button>
                </div>
              }
            >
              {collectionsQ.isLoading ? (
                <div style={{ padding: '16px' }}><LoadingSpinner text="Loading collections…" /></div>
              ) : filteredCollections.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<Wallet />}
                    title={allCollections.length === 0 ? 'No collections yet' : 'No matching collections'}
                    description={allCollections.length === 0 ? 'Record a collection to see it here.' : 'Try clearing the search or method filter.'}
                  />
                </div>
              ) : (
                <DataTable
                  bare
                  columns={buildCollectionColumns()}
                  data={filteredCollections}
                  emptyMessage="No collections."
                  getRowId={(r: any) => r.id}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'sales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <KpiStrip columns={4}>
              <KpiTile dot="warning" valueTone="warning" label="Credit Issued Today" value={inr(salesKpis.today)} hint={`${salesKpis.todayCount} ${salesKpis.todayCount === 1 ? 'sale' : 'sales'}`} />
              <KpiTile dot="brand" label="Credit This Month" value={inr(salesKpis.month)} />
              <KpiTile dot="info" label="Customers on Credit" value={String(salesKpis.customers)} />
              <KpiTile dot="warning" valueTone="warning" label="Total Receivables" value={inr(customers.reduce((s: number, c: any) => s + Number(c.currentBalance || 0), 0))} hint="Outstanding dues" />
            </KpiStrip>

            <Panel
              flush
              title="Credit sales"
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      value={salesSearch}
                      onChange={(e) => setSalesSearch(e.target.value)}
                      placeholder="Search customer / vehicle / product…"
                      style={{ height: '28px', padding: '0 8px 0 26px', width: '260px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                    />
                  </div>
                  <span aria-hidden="true" style={{ width: '1px', height: '18px', background: 'var(--border-soft)', margin: '0 2px' }} />
                  <button type="button" aria-label="About credit sales" title="Credit sales are receivables — fuel-on-credit and merchandise on credit. They never touch the drawer; record them from the shift handover." style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', width: '28px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'help' }}>
                    <HelpCircle size={14} />
                  </button>
                </div>
              }
            >
              {creditSalesQ.isLoading ? (
                <div style={{ padding: '16px' }}><LoadingSpinner text="Loading credit sales…" /></div>
              ) : filteredCreditSales.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<CreditCard />}
                    title={allCreditSales.length === 0 ? 'No credit sales yet' : 'No matching credit sales'}
                    description={allCreditSales.length === 0 ? 'Fuel-on-credit and merchandise-on-credit sales appear here.' : 'Try a different search term.'}
                  />
                </div>
              ) : (
                <DataTable
                  bare
                  columns={buildCreditSaleColumns()}
                  data={filteredCreditSales}
                  emptyMessage="No credit sales."
                  getRowId={(r: any) => r.id}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'registry' && (
          <DataTable
            columns={buildCustomerColumns(openLedgerDrawer, openEditDrawer, anyPrepaid)}
            data={allCustomers}
            emptyMessage="No customers registered."
            getRowId={(r: any) => r.id}
          />
        )}

        {activeTab === 'vehicles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {vehicleError && (
              <div style={{ padding: '12px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)', fontSize: '12px' }}>
                {vehicleError}
              </div>
            )}

            {loadingVehicles ? (
              <LoadingSpinner text="Loading vehicles..." />
            ) : (
              <Panel
                flush
                title="Vehicles"
                action={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        value={vehicleSearch}
                        onChange={(e) => setVehicleSearch(e.target.value)}
                        placeholder="Search registration / customer…"
                        style={{ height: '28px', padding: '0 8px 0 26px', width: '240px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                    <Chip tone="neutral" size="xs">{filteredVehicles.length}</Chip>
                  </div>
                }
              >
                {filteredVehicles.length === 0 ? (
                  <div style={{ padding: '12px' }}>
                    <EmptyState
                      compact
                      icon={<Truck />}
                      title={allVehicles.length === 0 ? 'No vehicles' : 'No matching vehicles'}
                      description={allVehicles.length === 0 ? 'Register a vehicle against a Credit or Fleet customer to see it here.' : 'Try a different search term.'}
                    />
                  </div>
                ) : (
                  <DataTable
                    bare
                    columns={buildVehicleColumns(openEditVehicleDrawer, onDeleteVehicle)}
                    data={filteredVehicles}
                    emptyMessage="No vehicles registered."
                    getRowId={(r: any) => r.id}
                  />
                )}
              </Panel>
            )}
          </div>
        )}
      </div>

      {/* CRUD Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}
      >
        <form onSubmit={handleSubmitCust(onSaveCustomer)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {drawerError && (
            <div style={{
              backgroundColor: 'var(--state-danger-bg)',
              color: 'var(--state-danger-fg)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-input)',
              fontSize: '12px',
              border: '1px solid var(--border-soft)'
            }}>
              {drawerError}
            </div>
          )}

          <Field label="Customer Name" required error={custErrors.name?.message}>
            <TextInput placeholder="e.g. KSRTC Depot, John Doe" {...registerCust('name')} disabled={drawerSubmitting} invalid={!!custErrors.name} />
          </Field>

          <Field label="Phone Number" error={custErrors.phone?.message}>
            <TextInput placeholder="e.g. +91 9900…" {...registerCust('phone')} disabled={drawerSubmitting} invalid={!!custErrors.phone} />
          </Field>

          <Field label="Account Type" required error={custErrors.customerType?.message}>
            <Select {...registerCust('customerType')} disabled={drawerSubmitting} invalid={!!custErrors.customerType}>
              <option value="Regular">Regular (Cash/Card/UPI walk-in)</option>
              <option value="Credit">Credit (Standard outstanding account)</option>
              <option value="Fleet">Fleet (Requires fleet code authorization)</option>
            </Select>
          </Field>

          {(custType === 'Credit' || custType === 'Fleet') && (
            <Field label="Credit Limit" error={custErrors.creditLimit?.message}>
              <MoneyInput placeholder="50000" {...registerCust('creditLimit', { valueAsNumber: true })} disabled={drawerSubmitting} invalid={!!custErrors.creditLimit} />
            </Field>
          )}

          {custType === 'Fleet' && (
            <Field label="Fleet Code / Card Reference" error={custErrors.fleetCode?.message}>
              <TextInput placeholder="e.g. FL-9923" {...registerCust('fleetCode')} disabled={drawerSubmitting} invalid={!!custErrors.fleetCode} />
            </Field>
          )}

          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px', marginTop: '4px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 12px' }}>
              GST &amp; Tax Registration (Optional B2B)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Field label="GSTIN" error={custErrors.metadata?.gstin?.message}>
                <TextInput placeholder="15-digit GSTIN" {...registerCust('metadata.gstin', { onChange: (e) => setValueCust('metadata.gstin', e.target.value.toUpperCase()) })} disabled={drawerSubmitting} invalid={!!custErrors.metadata?.gstin} />
              </Field>
              <Field label="State Code">
                <TextInput placeholder="e.g. 29" maxLength={2} {...registerCust('metadata.stateCode')} disabled={drawerSubmitting} />
              </Field>
              <Field label="PAN" error={custErrors.metadata?.pan?.message}>
                <TextInput placeholder="10-digit PAN" {...registerCust('metadata.pan', { onChange: (e) => setValueCust('metadata.pan', e.target.value.toUpperCase()) })} disabled={drawerSubmitting} invalid={!!custErrors.metadata?.pan} />
              </Field>
            </div>

            <Field label="Trade Name" error={custErrors.metadata?.tradeName?.message}>
              <TextInput placeholder="Business Trade Name" {...registerCust('metadata.tradeName')} disabled={drawerSubmitting} invalid={!!custErrors.metadata?.tradeName} />
            </Field>

            <Field label="Billing Address" error={custErrors.metadata?.billingAddress?.message}>
              <Textarea placeholder="Full Billing Address" rows={2} {...registerCust('metadata.billingAddress')} disabled={drawerSubmitting} invalid={!!custErrors.metadata?.billingAddress} />
            </Field>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            <Checkbox
              label="Enable Prepaid Wallet Mode"
              {...registerCust('isPrepaid')}
              disabled={drawerSubmitting}
            />
            <Checkbox
              label="Account Active (Clear for operational logging)"
              {...registerCust('isActive')}
              disabled={drawerSubmitting}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <Button type="submit" variant="primary" fullWidth loading={drawerSubmitting}>Save Customer</Button>
            <Button type="button" variant="secondary" fullWidth disabled={drawerSubmitting} onClick={() => setIsDrawerOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Drawer>

      {/* Collections Drawer */}
      <Drawer
        isOpen={isCollectionDrawerOpen}
        onClose={closeCollectionDrawer}
        title="Log Credit Transaction / Collection"
      >
        <CollectionEntryForm
            shiftOptions={[]}
            showShiftHintWhenSingle={false}
            showDateField
            dateLabel="Collection Date"
            stationId={selectedStation?.id}
            defaultValues={collectionDefaults}
            customers={customers}
            submitting={collectionSubmitting}
            error={formError}
            onCancel={closeCollectionDrawer}
            onSubmit={onAddCollection}
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
      </Drawer>

      {/* Customer Ledger Drawer */}
      <Drawer
        isOpen={selectedLedgerCustomer !== null}
        onClose={() => setSelectedLedgerCustomer(null)}
        title="Customer Account Statement"
        widthVariant="wide"
      >
        {selectedLedgerCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-sans)' }}>
            {/* Customer Summary Card */}
            <div style={{
              backgroundColor: 'var(--bg-surface-alt)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
                    {selectedLedgerCustomer.name}
                  </h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: selectedLedgerCustomer.customerType === 'Fleet' ? 'var(--state-info-bg)' : selectedLedgerCustomer.customerType === 'Credit' ? 'var(--state-warning-bg)' : 'var(--bg-surface)',
                    color: selectedLedgerCustomer.customerType === 'Fleet' ? 'var(--state-info-fg)' : selectedLedgerCustomer.customerType === 'Credit' ? 'var(--state-warning-fg)' : 'var(--text-strong)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-chip)',
                    display: 'inline-block',
                    marginTop: '4px'
                  }}>
                    {selectedLedgerCustomer.customerType}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {selectedLedgerCustomer.isPrepaid ? 'Prepaid Wallet Balance' : 'Outstanding Balance'}
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: selectedLedgerCustomer.isPrepaid
                      ? 'var(--state-success-fg)'
                      : selectedLedgerCustomer.creditLimit > 0 && selectedLedgerCustomer.currentBalance > selectedLedgerCustomer.creditLimit
                        ? 'var(--brand-danger)'
                        : selectedLedgerCustomer.currentBalance > 0
                          ? 'var(--brand-warning)'
                          : 'var(--state-success-fg)'
                  }}>
                    {inr(selectedLedgerCustomer.isPrepaid ? selectedLedgerCustomer.prepaidBalance : selectedLedgerCustomer.currentBalance || 0)}
                  </div>
                </div>
              </div>

                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Credit Limit</span>
                  <strong style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                    {selectedLedgerCustomer.creditLimit > 0 ? inr(selectedLedgerCustomer.creditLimit) : 'N/A'}
                  </strong>
                </div>
                {selectedLedgerCustomer.creditLimit > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>Available Credit</span>
                    <strong style={{
                      color: (selectedLedgerCustomer.creditLimit - selectedLedgerCustomer.currentBalance) < 0 ? 'var(--brand-danger)' : 'var(--text-strong)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {inr(Math.max(0, Number(selectedLedgerCustomer.creditLimit) - Number(selectedLedgerCustomer.currentBalance)))}
                    </strong>
                  </div>
                )}
              </div>

              {selectedLedgerCustomer.isPrepaid && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Top-up prepaid wallet for this customer.
                  </div>
                  <Button variant="secondary" size="sm" leftIcon={<Plus />} onClick={openTopupDrawer}>Top Up</Button>
                </div>
              )}

              {(selectedLedgerCustomer.metadata?.gstin || selectedLedgerCustomer.metadata?.pan || selectedLedgerCustomer.metadata?.billingAddress) && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-muted)' }}>
                  {selectedLedgerCustomer.metadata?.gstin && <div><strong>GSTIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLedgerCustomer.metadata.gstin}</span></div>}
                  {selectedLedgerCustomer.metadata?.pan && <div><strong>PAN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLedgerCustomer.metadata.pan}</span></div>}
                  {selectedLedgerCustomer.metadata?.billingAddress && <div><strong>Billing Address:</strong> {selectedLedgerCustomer.metadata.billingAddress}</div>}
                </div>
              )}
            </div>

            {/* Ledger Timeline Table */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '8px' }}>
                Statement of Account
              </h4>

              <LedgerView
                entries={ledgerTransactions}
                loading={loadingLedger}
                error={ledgerError}
                amountLabel="Amount"
                balanceLabel="Balance"
                emptyText="No transaction history found for this account."
                resolve={(tx: any) => {
                  const type = tx.transactionType;
                  const direction: 'debit' | 'credit' =
                    type === 'Credit Sale' || type === 'Adjustment' || type === 'Prepaid Top-up' ? 'debit' : 'credit';
                  const typeColor =
                    type === 'Credit Sale' ? 'var(--brand-warning)' : type === 'Prepaid Top-up' ? 'var(--state-success-fg)' : undefined;
                  return {
                    id: tx.id,
                    date: tx.createdAt,
                    dateLabel: tx.businessDate
                      ? new Date(tx.businessDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                      : new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
                    subLabel: new Date(tx.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    type,
                    typeColor,
                    notes: tx.notes,
                    amount: Number(tx.amount),
                    direction,
                  };
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <Button variant="secondary" size="sm" leftIcon={<Edit />} onClick={() => { const c = selectedLedgerCustomer; setSelectedLedgerCustomer(null); openEditDrawer(c); }}>Edit profile</Button>
              <Button variant="secondary" size="sm" leftIcon={<Wallet />} onClick={() => { const c = selectedLedgerCustomer; setSelectedLedgerCustomer(null); openCollectionDrawer(c.id); }}>Record collection</Button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        isOpen={isTopupDrawerOpen}
        onClose={() => setIsTopupDrawerOpen(false)}
        title="Prepaid Wallet Top-Up"
      >
        <form onSubmit={handleTopupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {topupError && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
              {topupError}
            </div>
          )}

          <Field label="Amount" required>
            <MoneyInput value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} disabled={topupSubmitting} placeholder="0.00" step="0.01" />
          </Field>

          <Field label="Payment Method" required>
            <Select value={topupPaymentMethod} onChange={(e) => setTopupPaymentMethod(e.target.value as any)} disabled={topupSubmitting}>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
              <option value="BankTransfer">Bank Transfer</option>
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea rows={2} value={topupNotes} onChange={(e) => setTopupNotes(e.target.value)} disabled={topupSubmitting} placeholder="Optional reference or remark" />
          </Field>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <Button type="submit" variant="primary" fullWidth loading={topupSubmitting} disabled={!topupAmount}>Record Top-Up</Button>
            <Button type="button" variant="secondary" fullWidth disabled={topupSubmitting} onClick={() => setIsTopupDrawerOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Drawer>

      <Drawer
        isOpen={isVehicleDrawerOpen}
        onClose={() => setIsVehicleDrawerOpen(false)}
        title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
      >
        <form onSubmit={onSaveVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {vehicleError && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
              {vehicleError}
            </div>
          )}

          {!editingVehicle && (
            <Field label="Customer" required>
              <Combobox
                options={allCustomers
                  .filter((c: any) => c.customerType === 'Credit' || c.customerType === 'Fleet')
                  .map((c: any) => ({ value: c.id, label: `${c.name} (${c.customerType})` }))}
                value={vehicleForm.customerId}
                onChange={(value) => setVehicleForm((prev) => ({ ...prev, customerId: value }))}
                placeholder="Select customer…"
                searchPlaceholder="Search customers…"
              />
            </Field>
          )}

          <Field label="Registration Number" required>
            <TextInput
              value={vehicleForm.registrationNumber}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, registrationNumber: e.target.value.toUpperCase() }))}
              disabled={vehicleSubmitting}
              placeholder="e.g. KL07AB1234"
            />
          </Field>

          <Field label="Vehicle Type" required>
            <TextInput
              value={vehicleForm.vehicleType}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, vehicleType: e.target.value }))}
              disabled={vehicleSubmitting}
              placeholder="e.g. Truck, Bus"
            />
          </Field>

          <Field label="Default Fuel Product">
            <Select
              value={vehicleForm.defaultProductId}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, defaultProductId: e.target.value }))}
              disabled={vehicleSubmitting}
            >
              <option value="">-- Select Product --</option>
              {fuelProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </Select>
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              label="Vehicle Active"
              checked={vehicleForm.isActive}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              disabled={vehicleSubmitting}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <Button type="submit" variant="primary" fullWidth loading={vehicleSubmitting}>Save Vehicle</Button>
            <Button type="button" variant="secondary" fullWidth disabled={vehicleSubmitting} onClick={() => setIsVehicleDrawerOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Drawer>
    </PageLayout>
  );
};

