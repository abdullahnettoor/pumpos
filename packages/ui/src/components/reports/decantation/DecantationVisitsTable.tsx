import React from 'react';
import type { DecantationReportInvoiceLink, DecantationReportVisit } from '@pump/shared';
import {
  InteractiveTable,
  StatusChip,
  VarianceChip,
  type TableColumn,
} from '../../../pump-ds/index.js';
import { formatDate, formatDensity, formatQuantity } from '../../../utils/format.js';
import { DENSITY_TOLERANCE, linkState, litres, transitText, visitState } from './vocabulary.js';

const Detail: React.FC<{ children: React.ReactNode; mono?: boolean }> = ({ children, mono }) => (
  <span className={mono ? 'font-mono text-[12px] text-ink-muted' : 'text-[12px] text-ink-muted'}>
    {children}
  </span>
);

const Stack: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="flex flex-col items-start gap-1 leading-tight">{children}</span>
);

const StatusCell: React.FC<{ v: DecantationReportVisit }> = ({ v }) => {
  const state = visitState(v.status);
  return (
    <Stack>
      <StatusChip status={state.status} label={state.label} size="md" />
      {v.flags.length > 0 && (
        <StatusChip
          status="variance"
          label={`${v.flags.length} ${v.flags.length === 1 ? 'flag' : 'flags'}`}
          size="md"
        />
      )}
    </Stack>
  );
};

const TransitCell: React.FC<{ v: DecantationReportVisit }> = ({ v }) => {
  const station = v.summary.settledInvoiceVarianceQty;
  return (
    <Stack>
      {v.chambers.length === 0 ? (
        <Detail>No chambers recorded</Detail>
      ) : v.chamberSummary.hasTransitDiscrepancy ? (
        <>
          <StatusChip status="variance" label="Transit discrepancy" size="md" />
          <Detail>{transitText(v)}</Detail>
        </>
      ) : (
        <Detail>
          OK · {v.chamberSummary.totalChambers}{' '}
          {v.chamberSummary.totalChambers === 1 ? 'chamber' : 'chambers'}
        </Detail>
      )}
      {station !== null && <Detail>Station {formatQuantity(station, 'L', { plus: true })}</Detail>}
    </Stack>
  );
};

const LinesCell: React.FC<{ v: DecantationReportVisit }> = ({ v }) => {
  if (v.tankLines.length === 0) return <Detail>No lines</Detail>;
  return (
    <Stack>
      {v.tankLines.map((l) => (
        <span key={l.id} className="flex flex-wrap items-center gap-x-1.5 text-[12px]">
          <span className="font-medium text-ink-strong">
            {l.tankName} ({l.productCode})
          </span>
          <span className="font-mono tabular-nums">
            {l.receivedQty !== null ? litres(l.receivedQty) : 'Pending dip'}
          </span>
          {l.roDensity !== null && (
            <span className="text-ink-muted">
              · RO: {formatDensity(l.roDensity)}
              {l.densityDeviation !== null &&
                Math.abs(l.densityDeviation) <= DENSITY_TOLERANCE &&
                ` (${formatDensity(l.densityDeviation, { plus: true })})`}
            </span>
          )}
          {l.densityDeviation !== null && Math.abs(l.densityDeviation) > DENSITY_TOLERANCE && (
            <StatusChip
              status="variance"
              label={`Density ${formatDensity(l.densityDeviation, { plus: true })}`}
              size="md"
            />
          )}
        </span>
      ))}
    </Stack>
  );
};

const LinkLine: React.FC<{ link: DecantationReportInvoiceLink }> = ({ link }) => {
  const waiting = linkState(link);
  if (waiting && link.status !== 'SETTLING') {
    return <StatusChip status={waiting.status} label={waiting.label} size="md" />;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
      <span className="font-medium text-ink-strong">{link.invoiceNumber || 'Linked invoice'}:</span>
      <span className="font-mono tabular-nums">{litres(link.receivedQty)} received</span>
      {waiting ? (
        <StatusChip status={waiting.status} label={waiting.label} size="md" />
      ) : (
        <VarianceChip amount={link.varianceQty} kind="stock" size="md" />
      )}
      {link.linkedVisitCount > 1 && <Detail>variance across {link.linkedVisitCount} visits</Detail>}
    </span>
  );
};

const InvoiceCell: React.FC<{ v: DecantationReportVisit }> = ({ v }) =>
  v.invoiceLinks.length === 0 ? (
    <Detail>—</Detail>
  ) : (
    <Stack>
      {v.invoiceLinks.map((link, i) => (
        <LinkLine key={`${link.purchaseId ?? 'none'}:${link.productId}:${i}`} link={link} />
      ))}
    </Stack>
  );

const COLUMNS: TableColumn<DecantationReportVisit>[] = [
  {
    id: 'date',
    header: 'Date',
    kind: 'date',
    value: (v) => v.date,
    cell: (v) => (
      <Stack>
        <span className="font-medium text-ink-strong">{formatDate(v.date)}</span>
        <Detail mono>{v.documentNumber}</Detail>
      </Stack>
    ),
    width: '11%',
  },
  {
    id: 'tanker',
    header: 'Tanker',
    kind: 'text',
    value: (v) => v.tankerNumber,
    cell: (v) => (
      <Stack>
        <span className="font-medium text-ink-strong">{v.tankerNumber}</span>
        {v.driverName && <Detail>{v.driverName}</Detail>}
      </Stack>
    ),
    width: '12%',
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'text',
    value: (v) => visitState(v.status).label,
    cell: (v) => <StatusCell v={v} />,
    width: '12%',
  },
  {
    id: 'transit',
    header: 'Chamber integrity',
    kind: 'text',
    value: (v) => v.summary.transitDiscrepancies,
    cell: (v) => <TransitCell v={v} />,
    width: '14%',
  },
  {
    id: 'lines',
    header: 'Tank lines and density',
    kind: 'text',
    value: (v) => v.tankLines.length,
    cell: (v) => <LinesCell v={v} />,
  },
  {
    id: 'received',
    header: 'Received',
    kind: 'qty',
    unit: 'L',
    value: (v) => v.totalReceivedQty,
    width: '11%',
  },
  {
    id: 'invoice',
    header: 'Linked invoice and variance',
    kind: 'text',
    value: (v) =>
      v.invoiceLinks
        .map((l) => l.invoiceNumber)
        .filter(Boolean)
        .join(', '),
    cell: (v) => <InvoiceCell v={v} />,
  },
];

/**
 * One row per tanker visit; a row opens the visit's drawer. Its total is the
 * volume received in the range (the server's figure, not a re-sum).
 */
export const DecantationVisitsTable: React.FC<{
  visits: DecantationReportVisit[];
  totalReceivedQty: number;
  onSelect: (v: DecantationReportVisit) => void;
}> = ({ visits, totalReceivedQty, onSelect }) => {
  const totalRow = React.useMemo(
    () => ({ label: 'Total received', values: { received: totalReceivedQty } }),
    [totalReceivedQty],
  );
  return (
    <div data-testid="decantation-report-table">
      <InteractiveTable
        bare
        columns={COLUMNS}
        rows={visits}
        rowKey={(v) => v.id}
        totalRow={totalRow}
        onRowClick={onSelect}
        rowLabel={(v) => `Tanker visit ${v.documentNumber}, ${v.tankerNumber}`}
        title="tanker visits"
      />
    </div>
  );
};
