import React, { useMemo, useState } from 'react';
import {
  Button,
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  SectionHeader,
  StatusChip,
  type SectionQuery,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useRunTask } from '../../utils/runTask.js';
import { officeSubmitKeys, sendKeyed } from '../../office-records/submitKeys.js';
import { mutationKeys, useDeleteHandoverProductSale } from '../../query/hooks.js';
import { latestOf, useWriteStates, type WriteEntry } from '../../query/pendingWrites.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { formatMoney } from '../../utils/format.js';
import { flashRows, useFlashingRows } from '../../utils/rowFlash.js';
import type { ProductSales, ProductSalesRow } from './liveShiftModel.js';
import { notSavedMessage } from './handoverWrites.js';
import {
  HandoverProductSaleDrawer,
  type BilledSaleRecord,
  type HandoverSaleRecord,
} from './HandoverProductSaleDrawer.js';

/** A row with its Handover Product Sale write still saving or refused, if any. */
type Row = ProductSalesRow & {
  /** The latest Handover sale save or removal on this row. */
  handoverWrite?: WriteEntry<unknown>;
  /** The latest Billed Sale save by this seller. */
  billedWrite?: WriteEntry<unknown>;
  /** The latest of the two: what the row says went wrong. */
  write?: WriteEntry<unknown>;
};

export interface ProductSalesSectionProps {
  shiftId: string;
  stationId: string | null;
  /** Both Product Sale lists of the shift (Handover Product Sales, Billed Sales). */
  queries: SectionQuery[];
  sales: ProductSales;
  handoverSales: HandoverSaleRecord[];
  billed: BilledSaleRecord[];
}

/** A Handover Product Sale save, by employee, on this shift. */
const saleWriteKey = (
  v: { shiftId: string; payload: { attendantId?: string } },
  shiftId: string,
): string | null => (v.shiftId === shiftId ? (v.payload.attendantId ?? null) : null);

/** A Billed Sale save, by seller ('unassigned' for none), on this shift. */
const billedWriteKey = (
  v: { payload: { shiftId: string; attendantId?: string | null } },
  shiftId: string,
): string | null => (v.payload.shiftId === shiftId ? v.payload.attendantId || UNASSIGNED : null);
const UNASSIGNED = 'unassigned';

/** A Handover Product Sale removal, by sale, on this shift. */
const removeWriteKey = (v: { saleId: string; shiftId?: string }, shiftId: string): string | null =>
  v.shiftId === shiftId ? v.saleId : null;

/** "Saving…" in place of a figure the server has not confirmed (#606), else the figure. */
const moneyOrSaving = (saving: boolean, value: number | null) =>
  saving ? (
    <StatusChip status="saving" size="sm" className="font-sans" />
  ) : value == null ? (
    ''
  ) : (
    formatMoney(value)
  );

const saving = (w: WriteEntry<unknown> | undefined) => w?.state === 'saving';

/**
 * Live shift → Product sales (#533): one row per employee (every attendant on a
 * DU, anyone else who sold, and "Unassigned"), with their Billed Sales, their
 * Handover Product Sale and the total. A row records or edits that employee's
 * Handover Product Sale; Billed Sales are recorded from Record ▾ → Product sale.
 * Same data and flows as before, on the Table module.
 */
export const ProductSalesSection: React.FC<ProductSalesSectionProps> = ({
  shiftId,
  stationId,
  queries,
  sales,
  handoverSales,
  billed,
}) => {
  const confirm = useConfirm();
  const runTask = useRunTask();
  const remove = useDeleteHandoverProductSale(stationId);
  // Each row's save or removal in flight, or refused (#606), from the writes themselves.
  const saleWrites = useWriteStates(mutationKeys.handoverProductSale(), saleWriteKey, shiftId);
  const removeWrites = useWriteStates(
    mutationKeys.deleteHandoverProductSale(),
    removeWriteKey,
    shiftId,
  );
  const flashing = useFlashingRows();
  const billedWrites = useWriteStates(mutationKeys.productSale(), billedWriteKey, shiftId);
  const rows = useMemo(
    () =>
      sales.rows.map((r) => {
        // Save and removal both act on the Handover sale: the later one wins,
        // so a refused edit never hides a removal sent after it.
        const handoverWrite = latestOf(
          r.attendantId ? saleWrites.get(r.attendantId) : undefined,
          r.handoverSale ? removeWrites.get(r.handoverSale.id) : undefined,
        );
        const billedWrite = billedWrites.get(r.attendantId ?? UNASSIGNED);
        return { ...r, handoverWrite, billedWrite, write: latestOf(handoverWrite, billedWrite) };
      }),
    [sales.rows, saleWrites, removeWrites, billedWrites],
  );
  const [drawer, setDrawer] = useState<{
    open: boolean;
    employeeId: string | null;
    token: number;
  }>({ open: false, employeeId: null, token: 0 });

  const open = (employeeId: string | null) =>
    setDrawer((d) => ({ open: true, employeeId, token: d.token + 1 }));

  const removeSale = async (row: ProductSalesRow) => {
    const sale = row.handoverSale;
    if (!sale) return;
    const ok = await confirm({
      title: 'Remove handover product sale?',
      message: `Delete ${row.name}'s handover product sale and put its items back in stock?`,
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      // One key session per confirmed removal, scoped to the sale's route: a
      // removal of another sale never reuses this key, while removing the same
      // sale again after an unanswered try recovers it from the shared store.
      await sendKeyed(
        officeSubmitKeys.session(`handover-product-sale:delete:${sale.id}`),
        { stationId, saleId: sale.id },
        (idempotencyKey) => remove.mutateAsync({ saleId: sale.id, shiftId, idempotencyKey }),
      );
      // The row updating, and its highlight, confirm it (#606): no toast.
      if (sale.attendantId) flashRows([sale.attendantId]);
    } catch {
      // The row says it was not removed, and why (#606).
    }
  };

  // Rebuilt each render: the row buttons call this render's handlers.
  const columns: TableColumn<Row>[] = [
    {
      id: 'employee',
      header: 'Employee',
      kind: 'text',
      value: (r) => r.name,
      cell: (r) => {
        const failed = notSavedMessage(r.write);
        return failed ? (
          <span className="flex flex-col">
            <span>{r.name}</span>
            <span role="alert" className="text-[12px] text-danger-fg">
              {failed}
            </span>
          </span>
        ) : (
          r.name
        );
      },
    },
    {
      id: 'billed',
      header: 'Billed sales',
      kind: 'money',
      value: (r) => r.billed,
      cell: (r) => moneyOrSaving(saving(r.billedWrite), r.billed),
      width: '18%',
    },
    {
      id: 'handover',
      header: 'Handover sale',
      kind: 'money',
      value: (r) => (r.handoverSale ? r.handover : null),
      cell: (r) => moneyOrSaving(saving(r.handoverWrite), r.handoverSale ? r.handover : null),
      width: '18%',
    },
    {
      id: 'total',
      header: 'Total',
      kind: 'money',
      value: (r) => r.total,
      cell: (r) => moneyOrSaving(saving(r.handoverWrite) || saving(r.billedWrite), r.total),
      width: '18%',
    },
    {
      id: 'actions',
      header: '',
      kind: 'text',
      sortable: false,
      width: '22%',
      value: () => '',
      cell: (r) =>
        r.attendantId ? (
          <div className="flex justify-end gap-1">
            <Button
              variant={r.handoverSale ? 'ghost' : 'secondary'}
              size="xs"
              aria-label={`${r.handoverSale ? 'Edit' : 'Record'} ${r.name}'s handover product sale`}
              onClick={() => open(r.attendantId)}
            >
              {r.handoverSale ? 'Edit' : 'Record'}
            </Button>
            {r.handoverSale && (
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                aria-label={`Remove ${r.name}'s handover product sale`}
                leftIcon={<Icon name="trash" size="xs" />}
                onClick={() => runTask(removeSale(r), 'Could not remove the sale.')}
              />
            )}
          </div>
        ) : null,
    },
  ];

  const totalRow = useMemo<TotalRow>(() => ({ label: 'Total' }), []);

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Product sales">
      <SectionHeader
        title="Product sales"
        subtitle={countOf(sales.rows.length, 'employee', 'employees')}
        controls={{
          actions: (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="plus" size="xs" />}
              onClick={() => open(null)}
            >
              Handover sale
            </Button>
          ),
          info: (
            <InfoTip label="About product sales" placement="bottom">
              A Billed Sale is a product sale recorded one by one (Record → Product sale). A
              Handover Product Sale is what an employee declares for the products they sold this
              shift without billing them, one per employee. Its cash goes to their drawer.
            </InfoTip>
          ),
        }}
      />
      <DataSection
        title="product sales"
        query={queries}
        placeholderHeight={160}
        flush
        isEmpty={sales.rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="shopping-bag" size="md" />}
              title="No product sales yet"
              description="Billed sales and handover sales recorded this shift show here."
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={columns}
          rows={rows}
          rowKey={(r) => r.attendantId ?? 'unassigned'}
          flashRowIds={flashing}
          totalRow={totalRow}
          title="product sales"
        />
      </DataSection>
      <HandoverProductSaleDrawer
        key={drawer.token}
        isOpen={drawer.open}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        shiftId={shiftId}
        stationId={stationId}
        employeeId={drawer.employeeId}
        handoverSales={handoverSales}
        billed={billed}
      />
    </section>
  );
};
