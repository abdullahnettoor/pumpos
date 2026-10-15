import React from 'react';
import { Button, Chip, Icon, StatusChip, type TableColumn } from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { creditLineOf, standingStatuses, type StandingRow } from './customerStanding.js';

/**
 * Column builders for the Customers screen tables (Table module, #524). Pure
 * functions (data-in → column defs), so each table's shape lives in one place
 * and the container stays focused on orchestration.
 *
 * Money is plain: red and amber appear only as a status chip for a problem
 * (Over limit, Overdue), never on an ordinary figure.
 */

export const methodLabel = (m: string): string => (m === 'BankTransfer' ? 'Bank' : m);

/**
 * The customer's account type (Regular · Credit · Fleet) as one neutral chip,
 * the same on the list, the statement and the vehicles. A type is not a
 * state, so it carries no tone.
 */
export const CustomerTypeChip: React.FC<{ type?: string | null }> = ({ type }) =>
  type ? (
    <Chip tone="neutral" size="xs">
      {type}
    </Chip>
  ) : null;

const Faint: React.FC = () => <span className="text-ink-faint">—</span>;

/** A name and, under it, the lines that tell it apart. Each detail is 12px muted. */
const Stacked: React.FC<{ children: React.ReactNode; details: (string | null | undefined)[] }> = ({
  children,
  details,
}) => (
  <span className="inline-flex min-w-0 flex-col items-start leading-tight">
    {children}
    {details.filter(Boolean).map((d) => (
      <span key={d} className="mt-0.5 text-[12px] font-normal text-ink-muted">
        {d}
      </span>
    ))}
  </span>
);

/** How much of the credit line is used: brand, amber from 90% used, red over the line. */
const CreditLineCell: React.FC<{ row: StandingRow }> = ({ row }) => {
  const limit = creditLineOf(row.customer);
  if (limit <= 0) return <Faint />;
  const used = row.standing.receivable;
  const pct = Math.min(100, (used / limit) * 100);
  const fill =
    used > limit ? 'fill-danger-fg' : used >= limit * 0.9 ? 'fill-warning-fg' : 'fill-brand';
  return (
    <span className="inline-flex w-[112px] flex-col items-end gap-1">
      <span>{formatMoney(limit)}</span>
      <svg
        className="h-1.5 w-full overflow-hidden rounded-full"
        role="meter"
        aria-label="Credit used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <rect width="100%" height="100%" className="fill-surface-alt" />
        <rect width={`${pct}%`} height="100%" className={fill} />
      </svg>
    </span>
  );
};

/** The row's status chips (`standingStatuses`); a settled account reads "Paid up". */
const StandingCell: React.FC<{ row: StandingRow }> = ({ row }) => {
  const chips = standingStatuses(row);
  if (chips.length)
    return (
      <span className="inline-flex flex-wrap gap-1">
        {chips.map((c) => (
          <StatusChip key={c.status} status={c.status} label={c.label} size="xs" />
        ))}
      </span>
    );
  return row.standing.paidUp ? <span className="text-ink-muted">Paid up</span> : null;
};

export const buildCustomerColumns = (
  openStatement: (c: StandingRow['customer']) => void,
  openEdit: (c: StandingRow['customer']) => void,
  showPrepaid: boolean,
): TableColumn<StandingRow>[] => [
  {
    id: 'name',
    header: 'Customer',
    kind: 'text',
    value: (r) => r.customer.name,
    width: '26%',
    cell: ({ customer: c }) => (
      <Stacked
        details={[c.metadata?.tradeName, c.metadata?.gstin ? `GSTIN ${c.metadata.gstin}` : null]}
      >
        <Button
          variant="ghost"
          size="xs"
          onClick={() => openStatement(c)}
          className="h-auto justify-start whitespace-normal border-0 px-0 text-left text-[13px] text-brand hover:bg-transparent hover:underline active:bg-transparent"
        >
          {c.name}
        </Button>
      </Stacked>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    kind: 'text',
    value: (r) => r.customer.customerType,
    width: '13%',
    cell: ({ customer: c }) => (
      <Stacked
        details={[
          c.customerType === 'Fleet' ? c.fleetCode : null,
          c.settlementCycle === 'EOD' ? 'Settles end of day' : null,
        ]}
      >
        {c.customerType ? <CustomerTypeChip type={c.customerType} /> : <Faint />}
      </Stacked>
    ),
  },
  {
    id: 'phone',
    header: 'Phone',
    kind: 'text',
    value: (r) => r.customer.phone,
    width: '12%',
    cell: ({ customer: c }) =>
      c.phone ? <span className="tabular-nums text-ink-muted">{c.phone}</span> : <Faint />,
  },
  ...(showPrepaid
    ? [
        {
          id: 'omc',
          header: 'OMC card',
          kind: 'text',
          value: (r) => (r.customer.isPrepaid ? 'OMC' : null),
          width: '8%',
          cell: (r) =>
            r.customer.isPrepaid ? (
              <Chip tone="neutral" size="xs">
                OMC
              </Chip>
            ) : (
              <Faint />
            ),
        } satisfies TableColumn<StandingRow>,
      ]
    : []),
  {
    id: 'creditLimit',
    header: 'Credit limit',
    kind: 'money',
    total: false,
    value: (r) => (creditLineOf(r.customer) > 0 ? creditLineOf(r.customer) : null),
    width: '14%',
    cell: (r) => <CreditLineCell row={r} />,
  },
  {
    id: 'receivable',
    header: 'Receivable',
    kind: 'money',
    value: (r) => r.standing.receivable,
    width: '14%',
    cell: ({ standing: s }) => (
      <span className="inline-flex flex-col items-end leading-tight">
        <span className="text-ink-strong">{formatMoney(s.receivable)}</span>
        {s.advance > 0 && (
          <span className="mt-0.5 font-sans text-[12px] text-ink-muted">
            {formatMoney(s.advance)} advance
          </span>
        )}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'text',
    value: (r) => {
      const first = standingStatuses(r)[0];
      return first ? (first.label ?? first.status) : r.standing.paidUp ? 'Paid up' : null;
    },
    cell: (r) => <StandingCell row={r} />,
  },
  {
    id: 'actions',
    header: '',
    kind: 'text',
    value: () => null,
    width: '5%',
    cell: (r) => (
      <Button
        variant="ghost"
        size="xs"
        iconOnly
        title="Edit customer"
        aria-label="Edit customer"
        onClick={() => openEdit(r.customer)}
      >
        <Icon name="edit" size="xs" />
      </Button>
    ),
  },
];

/** A Collection as the ledger lists it (an office record, dated by entry date). */
export interface CollectionRow {
  id: string;
  entryDate?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  paymentMethod?: string | null;
  accountName?: string | null;
  notes?: string | null;
  amount: number | string;
}

export const buildCollectionColumns = (): TableColumn<CollectionRow>[] => [
  {
    id: 'entryDate',
    header: 'Entry date',
    kind: 'date',
    value: (r) => r.entryDate,
    width: '13%',
  },
  {
    id: 'customer',
    header: 'Customer',
    kind: 'text',
    emphasis: true,
    value: (r) => r.customerName || 'Walk-in Customer',
    width: '22%',
  },
  {
    id: 'method',
    header: 'Method',
    kind: 'text',
    value: (r) => (r.paymentMethod ? methodLabel(r.paymentMethod) : null),
    width: '10%',
  },
  {
    id: 'account',
    header: 'Funding account',
    kind: 'text',
    value: (r) => r.accountName,
    width: '16%',
  },
  {
    id: 'notes',
    header: 'Notes',
    kind: 'text',
    value: (r) => r.notes,
    cell: (r) => (r.notes ? <span className="text-ink-muted">{r.notes}</span> : <Faint />),
  },
  {
    id: 'amount',
    header: 'Amount',
    kind: 'money',
    value: (r) => r.amount,
    width: '15%',
  },
];

/** A Credit Sale (a receivable debit, on the Business Day it was sold). */
export interface CreditSaleRow {
  id: string;
  businessDate?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  productName?: string | null;
  vehicleReg?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  notes?: string | null;
  amount: number | string;
}

export const buildCreditSaleColumns = (): TableColumn<CreditSaleRow>[] => [
  {
    id: 'businessDate',
    header: 'Business date',
    kind: 'date',
    value: (r) => r.businessDate,
    width: '13%',
  },
  {
    id: 'customer',
    header: 'Customer',
    kind: 'text',
    emphasis: true,
    value: (r) => r.customerName || 'Unknown',
    width: '22%',
  },
  {
    id: 'product',
    header: 'Product',
    kind: 'text',
    value: (r) => r.productName || 'Product',
  },
  {
    id: 'vehicle',
    header: 'Vehicle',
    kind: 'text',
    value: (r) => r.vehicleReg,
    width: '14%',
    cell: (r) =>
      r.vehicleReg ? <span className="font-mono text-ink-muted">{r.vehicleReg}</span> : <Faint />,
  },
  {
    id: 'quantity',
    header: 'Qty',
    kind: 'qty',
    total: false,
    value: (r) => (Number(r.quantity) ? r.quantity : null),
    unit: (r) => r.unit || 'L',
    width: '12%',
  },
  {
    id: 'amount',
    header: 'Amount',
    kind: 'money',
    value: (r) => r.amount,
    width: '15%',
  },
];

/** A customer vehicle. */
export interface VehicleRow {
  id: string;
  registrationNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  customerType?: string | null;
  vehicleType?: string | null;
  defaultProductName?: string | null;
  defaultProductCode?: string | null;
  isActive?: boolean | null;
  updatedAt?: string | null;
}

export const buildVehicleColumns = (
  openEdit: (v: VehicleRow) => void,
  onDelete: (v: VehicleRow) => void,
): TableColumn<VehicleRow>[] => [
  {
    id: 'registration',
    header: 'Registration no.',
    kind: 'text',
    emphasis: true,
    value: (r) => r.registrationNumber,
    width: '16%',
    cell: (r) => <span className="font-mono text-ink-strong">{r.registrationNumber}</span>,
  },
  {
    id: 'customer',
    header: 'Customer',
    kind: 'text',
    value: (r) => r.customerName,
    width: '24%',
    cell: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="font-medium text-ink-strong">{r.customerName || '—'}</span>
        <CustomerTypeChip type={r.customerType} />
      </span>
    ),
  },
  {
    id: 'vehicleType',
    header: 'Vehicle type',
    kind: 'text',
    value: (r) => r.vehicleType,
    width: '13%',
  },
  {
    id: 'defaultProduct',
    header: 'Default product',
    kind: 'text',
    value: (r) =>
      r.defaultProductName
        ? `${r.defaultProductName}${r.defaultProductCode ? ` (${r.defaultProductCode})` : ''}`
        : null,
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'status',
    value: (r) => (r.isActive ? 'active' : 'inactive'),
    width: '11%',
  },
  {
    id: 'updatedAt',
    header: 'Updated',
    kind: 'date',
    value: (r) => r.updatedAt,
    width: '12%',
  },
  {
    id: 'actions',
    header: '',
    kind: 'text',
    value: () => null,
    width: '8%',
    cell: (r) => (
      <span className="inline-flex gap-0.5">
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          title="Edit vehicle"
          aria-label="Edit vehicle"
          onClick={() => openEdit(r)}
        >
          <Icon name="edit" size="xs" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          title="Delete vehicle"
          aria-label="Delete vehicle"
          onClick={() => onDelete(r)}
        >
          <Icon name="trash" size="xs" />
        </Button>
      </span>
    ),
  },
];
