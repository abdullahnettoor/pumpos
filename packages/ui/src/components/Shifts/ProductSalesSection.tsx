import React, { useMemo, useState } from 'react';
import {
  Button,
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  SectionHeader,
  type SectionQuery,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { useDeleteHandoverProductSale } from '../../query/hooks.js';
import { countOf } from '../../utils/ledgerWindow.js';
import type { ProductSales, ProductSalesRow } from './liveShiftModel.js';
import {
  HandoverProductSaleDrawer,
  type BilledSaleRecord,
  type HandoverSaleRecord,
} from './HandoverProductSaleDrawer.js';

export interface ProductSalesSectionProps {
  shiftId: string;
  stationId: string | null;
  /** Both Product Sale lists of the shift (Handover Product Sales, Billed Sales). */
  queries: SectionQuery[];
  sales: ProductSales;
  handoverSales: HandoverSaleRecord[];
  billed: BilledSaleRecord[];
}

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
  const toast = useToast();
  const runTask = useRunTask();
  const remove = useDeleteHandoverProductSale(stationId);
  const removeKeyed = useKeyedSave('handover-product-sale:delete');
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
      await removeKeyed({ stationId, saleId: sale.id }, (idempotencyKey) =>
        remove.mutateAsync({ saleId: sale.id, idempotencyKey }),
      );
      toast.success('Handover product sale removed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the sale.');
    }
  };

  // Rebuilt each render: the row buttons call this render's handlers.
  const columns: TableColumn<ProductSalesRow>[] = [
    { id: 'employee', header: 'Employee', kind: 'text', value: (r) => r.name },
    { id: 'billed', header: 'Billed sales', kind: 'money', value: (r) => r.billed, width: '18%' },
    {
      id: 'handover',
      header: 'Handover sale',
      kind: 'money',
      value: (r) => (r.handoverSale ? r.handover : null),
      width: '18%',
    },
    { id: 'total', header: 'Total', kind: 'money', value: (r) => r.total, width: '18%' },
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
          rows={sales.rows}
          rowKey={(r) => r.attendantId ?? 'unassigned'}
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
