import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Inbox } from 'lucide-react';
import { DataSection, EmptyState, type SectionQuery } from '../pump-ds/index.js';
import { DataTable } from './primitives/DataTable.js';
import { inr } from '../utils/format.js';

/**
 * DataSection showcase — every state of a section that loads its own data,
 * side by side, for a card-shape section and a DataTable. Fake query objects
 * only: nothing here touches the network.
 */

const noop = () => undefined;

const refusal = Object.assign(
  new Error("Your plan doesn't include the Attendant report. Ask the Owner to upgrade."),
  { code: 'CAPABILITY_NOT_ENTITLED', status: 403 },
);
const fault = Object.assign(new Error('Request failed (502).'), { status: 502 });

type DemoState = 'loading' | 'error' | 'refused' | 'empty' | 'ready';

const STATES: { id: DemoState; label: string; note: string }[] = [
  { id: 'loading', label: 'Loading', note: 'pending, fetching or paused' },
  { id: 'error', label: 'Error', note: 'network / server — Retry' },
  { id: 'refused', label: 'Access refusal', note: '403 / access policy — no Retry' },
  { id: 'empty', label: 'Empty', note: 'succeeded, nothing to show' },
  { id: 'ready', label: 'Data', note: 'succeeded with rows' },
];

const QUERIES: Record<DemoState, SectionQuery> = {
  loading: { isPending: true, isError: false, fetchStatus: 'fetching', refetch: noop },
  error: { isPending: false, isError: true, fetchStatus: 'idle', error: fault, refetch: noop },
  refused: { isPending: false, isError: true, fetchStatus: 'idle', error: refusal, refetch: noop },
  empty: { isPending: false, isError: false, fetchStatus: 'idle', refetch: noop },
  ready: { isPending: false, isError: false, fetchStatus: 'idle', refetch: noop },
};

type Row = { customer: string; amount: number };
const ROWS: Row[] = [
  { customer: 'Lakshmi Transports', amount: 48250 },
  { customer: 'KSRTC Depot', amount: 31900 },
  { customer: 'Hosur Logistics', amount: 12400 },
];
const COLUMNS: ColumnDef<Row, any>[] = [
  { accessorKey: 'customer', header: 'Customer' },
  {
    accessorKey: 'amount',
    header: 'Due',
    cell: (c) => <span className="font-mono tabular-nums">{inr(c.getValue())}</span>,
  },
];

const CardBody: React.FC = () => (
  <div className="flex flex-col gap-2 text-[12.5px]">
    {ROWS.map((r) => (
      <div key={r.customer} className="flex justify-between gap-2">
        <span className="truncate text-ink-strong">{r.customer}</span>
        <span className="font-mono tabular-nums text-ink-strong">{inr(r.amount)}</span>
      </div>
    ))}
  </div>
);

const Column: React.FC<{ label: string; note: string; children: React.ReactNode }> = ({
  label,
  note,
  children,
}) => (
  <div className="flex min-w-0 flex-col gap-2">
    <div>
      <div className="font-mono text-[12px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="font-mono text-[12px] text-ink-faint">{note}</div>
    </div>
    {children}
  </div>
);

const StateGrid: React.FC<{ render: (s: DemoState) => React.ReactNode }> = ({ render }) => (
  <div className="grid grid-cols-5 items-start gap-4 py-4">
    {STATES.map((s) => (
      <Column key={s.id} label={s.label} note={s.note}>
        {render(s.id)}
      </Column>
    ))}
  </div>
);

export const DataSectionShowcase: React.FC = () => (
  <div>
    <div className="border-b border-border-soft">
      <div className="pt-3 font-mono text-[12px] uppercase tracking-wider text-ink-strong">
        DataSection · shape="card"
      </div>
      <StateGrid
        render={(s) => (
          <DataSection
            title="Receivables"
            query={QUERIES[s]}
            isEmpty={s === 'empty'}
            empty={<EmptyState compact icon={<Inbox />} title="Nothing to collect" />}
            placeholderHeight={88}
          >
            <CardBody />
          </DataSection>
        )}
      />
    </div>
    <div>
      <div className="pt-3 font-mono text-[12px] uppercase tracking-wider text-ink-strong">
        DataTable · bare DataSection inside
      </div>
      <StateGrid
        render={(s) => {
          const q = QUERIES[s];
          return (
            <DataTable
              dense
              title="receivables"
              columns={COLUMNS}
              data={s === 'ready' ? ROWS : s === 'empty' ? [] : undefined}
              isLoading={s === 'loading'}
              error={q.isError ? (q.error as Error) : null}
              onRetry={q.refetch}
              placeholderHeight={120}
              emptyMessage="No receivables."
            />
          );
        }}
      />
    </div>
  </div>
);
