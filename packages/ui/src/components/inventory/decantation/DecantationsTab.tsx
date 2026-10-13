import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { resolveDecantationSettings, type DecantationView } from '@pump/shared';
import {
  Button,
  Chip,
  DateText,
  EmptyState,
  Icon,
  Panel,
  SegmentedControl,
} from '../../../pump-ds/index.js';
import { DataTable } from '../../primitives/DataTable.js';
import { Banner } from '../../primitives/Banner.js';
import { useDecantations, useInventoryStatus } from '../../../query/hooks.js';
import { DecantationDrawer } from './DecantationDrawer.js';
import { LinkPurchaseDrawer } from './LinkPurchaseDrawer.js';
import { toDecantationRow, type DecantationRow } from './decantationRows.js';
import { formatQuantity } from '../../../utils/format.js';

type Filter = 'all' | 'flagged' | 'pending' | 'unlinked';

export interface DecantationsTabProps {
  station: { id: string; settings?: unknown } | null;
  userRole?: string | null;
}

const STATUS: Record<
  DecantationView['status'],
  { label: string; tone: 'neutral' | 'info' | 'success' }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_MEASUREMENT: { label: 'Pending measurement', tone: 'info' },
  MEASURED: { label: 'Measured', tone: 'success' },
  DISCARDED: { label: 'Discarded', tone: 'neutral' },
};

const FLAG_LABEL: Record<string, string> = {
  DENSITY_OUT_OF_TOLERANCE: 'Density off',
  TANKER_SHORT: 'Tanker short',
  CHAMBER_NOT_EMPTIED: 'Chamber not emptied',
  EARLY_AFTER_DIP: 'Early after dip',
};

const Muted: React.FC<{ children?: React.ReactNode }> = ({ children = '—' }) => (
  <span style={{ color: 'var(--text-faint)' }}>{children}</span>
);

const stack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  alignItems: 'flex-start',
};

/** Inventory → Decantations: one row per tanker visit with its tank lines grouped. */
export const DecantationsTab: React.FC<DecantationsTabProps> = ({ station, userRole }) => {
  const stationId = station?.id ?? null;
  const settings = useMemo(
    () => resolveDecantationSettings(station?.settings),
    [station?.settings],
  );
  const decantationsQ = useDecantations(stationId);
  const tanksQ = useInventoryStatus(stationId);
  const [filter, setFilter] = useState<Filter>('all');
  const [drawer, setDrawer] = useState<{ decantation: DecantationView | null } | null>(null);
  const [linking, setLinking] = useState<DecantationView | null>(null);

  const names = useMemo(() => {
    const tanks: Record<string, string> = {};
    const products: Record<string, string> = {};
    for (const t of tanksQ.data ?? []) {
      tanks[t.id] = t.name;
      products[t.productId] = t.productName ?? t.productCode ?? 'Fuel';
    }
    return { tanks, products };
  }, [tanksQ.data]);

  const rows = useMemo(
    () =>
      (decantationsQ.data ?? []).map((d) => toDecantationRow(d, names, settings.quantityTolerance)),
    [decantationsQ.data, names, settings.quantityTolerance],
  );
  const counts = useMemo(
    () => ({
      all: rows.length,
      flagged: rows.filter((r) => r.decantation.flags.length > 0).length,
      pending: rows.filter((r) => r.decantation.status !== 'MEASURED').length,
      unlinked: rows.filter((r) => r.unlinked.length > 0).length,
    }),
    [rows],
  );
  const visible = useMemo(
    () =>
      rows.filter((r) =>
        filter === 'flagged'
          ? r.decantation.flags.length > 0
          : filter === 'pending'
            ? r.decantation.status !== 'MEASURED'
            : filter === 'unlinked'
              ? r.unlinked.length > 0
              : true,
      ),
    [rows, filter],
  );

  const columns = useMemo<ColumnDef<DecantationRow, any>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorFn: (r) => r.decantation.businessDate ?? r.decantation.createdAt,
        cell: ({ row }) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DateText
              value={row.original.decantation.businessDate ?? row.original.decantation.createdAt}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {row.original.decantation.documentNumber}
            </span>
          </div>
        ),
      },
      {
        id: 'tanker',
        header: 'Tanker',
        accessorFn: (r) => r.decantation.tankerNumber,
        cell: ({ row }) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
              {row.original.decantation.tankerNumber}
            </span>
            {row.original.decantation.driverName && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {row.original.decantation.driverName}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'product',
        header: 'Product',
        enableSorting: false,
        cell: ({ row }) => <span>{row.original.productNames.join(' · ') || '—'}</span>,
      },
      {
        id: 'tanks',
        header: 'Tanks',
        enableSorting: false,
        cell: ({ row }) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
            {row.original.tanks.map((t) => (
              <span key={t.lineId} style={{ whiteSpace: 'nowrap' }}>
                {t.tankName}
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}
                  · {t.productName}
                  {t.status === 'MEASURED' && t.receivedQty != null
                    ? ` · ${formatQuantity(t.receivedQty, 'L')}`
                    : ''}
                </span>
              </span>
            ))}
          </div>
        ),
      },
      {
        id: 'invoiceQty',
        header: 'Invoice qty',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.invoiceQty != null ? (
            formatQuantity(row.original.invoiceQty, 'L')
          ) : (
            <Muted />
          ),
      },
      {
        id: 'received',
        header: 'Received',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.receivedQty != null ? (
            formatQuantity(row.original.receivedQty, 'L')
          ) : (
            <Muted />
          ),
      },
      {
        id: 'variance',
        header: 'Excess / Short',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.variances.length === 0 ? (
            <Muted />
          ) : (
            <div style={stack}>
              {row.original.variances.map((v) => (
                <Chip
                  key={v.productName}
                  size="xs"
                  variant="soft"
                  tone={
                    v.kind === 'OK'
                      ? 'success'
                      : v.outOfTolerance
                        ? v.kind === 'SHORT'
                          ? 'danger'
                          : 'warning'
                        : 'neutral'
                  }
                >
                  {v.kind === 'OK'
                    ? `${v.productName} · Matches`
                    : `${v.productName} · ${v.kind === 'SHORT' ? 'Short' : 'Excess'} ${formatQuantity(v.qty, 'L')}`}
                </Chip>
              ))}
            </div>
          ),
      },
      {
        id: 'density',
        header: 'Density',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.density.length === 0 ? (
            <Muted />
          ) : (
            <div style={stack}>
              {row.original.density.map((d) => (
                <Chip
                  key={d.productName}
                  size="xs"
                  variant="soft"
                  tone={d.outOfTolerance ? 'danger' : 'success'}
                >
                  {d.productName} · {d.diff > 0 ? '+' : ''}
                  {d.diff} kg/m³
                </Chip>
              ))}
            </div>
          ),
      },
      {
        id: 'flags',
        header: 'Flags',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.decantation.flags.length === 0 ? (
            <Muted />
          ) : (
            <div style={stack}>
              {row.original.decantation.flags.map((f, i) => (
                <span key={i} title={f.message}>
                  <Chip size="xs" tone="danger" icon={<Icon name="alert-triangle" size="xs" />}>
                    {FLAG_LABEL[f.code] ?? f.code}
                  </Chip>
                </span>
              ))}
            </div>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => r.decantation.status,
        cell: ({ row }) => {
          const s = STATUS[row.original.decantation.status];
          return (
            <div style={{ ...stack, gap: 4 }}>
              <Chip size="xs" tone={s.tone} variant="soft">
                {s.label}
              </Chip>
              {row.original.unlinked.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={`Link purchase for ${p}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLinking(row.original.decantation);
                  }}
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                >
                  <Chip size="xs" tone="warning" variant="soft">
                    Purchase not linked · {p}
                  </Chip>
                </button>
              ))}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {userRole === 'Owner' && counts.flagged > 0 && (
          <Banner severity="danger" title="Needs your review">
            {counts.flagged} flagged Decantation{counts.flagged === 1 ? '' : 's'}: density off,
            tanker short or chamber not emptied.
          </Banner>
        )}
        <Panel
          flush
          title="Decantations"
          icon={<Icon name="truck" size="sm" />}
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SegmentedControl<Filter>
                aria-label="Decantation filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: `All ${counts.all}` },
                  { value: 'flagged', label: `Flagged ${counts.flagged}` },
                  { value: 'pending', label: `Pending ${counts.pending}` },
                  { value: 'unlinked', label: `Not linked ${counts.unlinked}` },
                ]}
              />
              <Button
                size="sm"
                leftIcon={<Icon name="plus" size="sm" />}
                onClick={() => setDrawer({ decantation: null })}
              >
                New Decantation
              </Button>
            </div>
          }
        >
          {!decantationsQ.isLoading && rows.length === 0 ? (
            <div style={{ padding: 16 }}>
              <EmptyState
                compact
                icon={<Icon name="truck" size="md" />}
                title="No Decantations yet"
                description="Record each tanker unloading to measure what actually reached the tanks."
              />
            </div>
          ) : (
            <DataTable
              bare
              columns={columns}
              data={visible}
              isLoading={decantationsQ.isLoading}
              error={decantationsQ.error}
              title="decantations"
              onRetry={decantationsQ.refetch}
              emptyMessage="No Decantations match this filter."
              getRowId={(r) => r.decantation.id}
              initialSorting={[{ id: 'date', desc: true }]}
              onRowClick={(r) => {
                // A measured visit has posted stock and is sealed; the others reopen in the drawer.
                if (r.decantation.status !== 'MEASURED') setDrawer({ decantation: r.decantation });
              }}
            />
          )}
        </Panel>
      </div>
      <DecantationDrawer
        isOpen={!!drawer}
        onClose={() => setDrawer(null)}
        station={station}
        decantation={drawer?.decantation ?? null}
      />
      <LinkPurchaseDrawer
        stationId={stationId}
        decantation={linking}
        productNames={names.products}
        onClose={() => setLinking(null)}
      />
    </>
  );
};
