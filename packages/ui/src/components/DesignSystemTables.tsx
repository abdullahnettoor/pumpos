import React from 'react';
import { InteractiveTable, StatementTable, type TableColumn } from '../pump-ds/index.js';

/**
 * Table module showcase: one set of column definitions rendered by both
 * adapters. Fake rows only.
 */

type Sale = {
  id: string;
  date: string;
  customer: string;
  product: string;
  litres: number;
  rate: number;
  amount: number;
  status: 'paid' | 'partial' | 'unpaid' | 'overdue';
};

export const TABLE_DEMO_ROWS: Sale[] = [
  {
    id: 's1',
    date: '2026-10-12',
    customer: 'Sri Balaji Transports',
    product: 'Diesel',
    litres: 1240,
    rate: 92.43,
    amount: 114613.2,
    status: 'paid',
  },
  {
    id: 's2',
    date: '2026-10-12',
    customer: 'Kaveri Travels',
    product: 'Petrol',
    litres: 86.5,
    rate: 101.06,
    amount: 8741.69,
    status: 'partial',
  },
  {
    id: 's3',
    date: '2026-10-13',
    customer: 'RTC Depot 4',
    product: 'Diesel',
    litres: 2410,
    rate: 92.43,
    amount: 222756.3,
    status: 'overdue',
  },
  {
    id: 's4',
    date: '2026-10-13',
    customer: 'Anand Logistics',
    product: 'Diesel',
    litres: 312.25,
    rate: 92.43,
    amount: 28861.27,
    status: 'unpaid',
  },
];

export const TABLE_DEMO_COLUMNS: TableColumn<Sale>[] = [
  { id: 'date', header: 'Date', kind: 'date', value: (r) => r.date },
  { id: 'customer', header: 'Customer', kind: 'text', value: (r) => r.customer },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  { id: 'litres', header: 'Volume', kind: 'qty', unit: 'L', value: (r) => r.litres },
  { id: 'rate', header: 'Rate', kind: 'money', total: false, value: (r) => r.rate },
  { id: 'amount', header: 'Amount', kind: 'money', emphasis: true, value: (r) => r.amount },
  { id: 'status', header: 'Status', kind: 'status', value: (r) => r.status },
];

export const InteractiveTableDemo: React.FC = () => (
  <InteractiveTable
    columns={TABLE_DEMO_COLUMNS}
    rows={TABLE_DEMO_ROWS}
    rowKey={(r) => r.id}
    onRowClick={() => undefined}
    totalRow
  />
);

export const StatementTableDemo: React.FC = () => (
  <StatementTable
    label="Credit sales"
    columns={TABLE_DEMO_COLUMNS}
    rows={TABLE_DEMO_ROWS}
    rowKey={(r) => r.id}
    totalRow
  />
);

const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
    {children}
  </div>
);

export const TablesShowcase: React.FC = () => (
  <div className="flex flex-col gap-6">
    <div>
      <Caption>Interactive · sort, row click, Data Section states</Caption>
      <InteractiveTableDemo />
    </div>
    <div className="rounded-card border border-border-soft bg-surface p-4">
      <Caption>Statement · read-only, compact, print-safe</Caption>
      <StatementTableDemo />
    </div>
  </div>
);
