import React from 'react';
import type {
  DecantationReportChamber,
  DecantationReportInvoiceLink,
  DecantationReportTankLine,
  DecantationReportVisit,
} from '@pump/shared';
import { Drawer } from '../../Drawer.js';
import {
  Icon,
  SectionHeader,
  StatementTable,
  StatusChip,
  VarianceChip,
  type TableColumn,
} from '../../../pump-ds/index.js';
import { formatDate, formatDateTime, formatDensity, formatTime } from '../../../utils/format.js';
import { DENSITY_TOLERANCE, linkState, litres, visitState } from './vocabulary.js';

/** A problem cell inside a statement: an outline chip, as the Table module prints status. */
const Problem: React.FC<{ label: string }> = ({ label }) => (
  <StatusChip status="variance" label={label} size="md" variant="outline" showIcon={false} />
);

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-ink-muted">{children}</span>
);

const NameAndCode: React.FC<{ name: string; code?: string | null }> = ({ name, code }) => (
  <span className="flex flex-col leading-tight">
    <span className="font-medium text-ink-strong">{name}</span>
    {code && <span className="text-[12px] text-ink-muted">{code}</span>}
  </span>
);

const CHAMBER_COLUMNS: TableColumn<DecantationReportChamber>[] = [
  { id: 'chamber', header: 'Chamber', kind: 'text', value: (c) => `Chamber ${c.chamberNo}` },
  { id: 'capacity', header: 'Capacity', kind: 'qty', unit: 'L', value: (c) => c.capacityL },
  { id: 'dip', header: 'Dip', kind: 'qty', unit: 'mm', value: (c) => c.dipMm, total: false },
  {
    id: 'mark',
    header: 'Mark',
    kind: 'text',
    value: (c) => c.mark ?? 'OK',
    cell: (c) =>
      c.mark === 'SHORT' ? (
        <Problem label="Short" />
      ) : c.mark === 'EXCESS' ? (
        <StatusChip status="surplus" size="md" variant="outline" showIcon={false} />
      ) : (
        <Muted>OK</Muted>
      ),
  },
  {
    id: 'seal',
    header: 'Seal',
    kind: 'text',
    value: (c) => (c.sealOk === false ? 'Broken' : 'Intact'),
    cell: (c) => (c.sealOk === false ? <Problem label="Broken" /> : <Muted>Intact</Muted>),
  },
  {
    id: 'emptied',
    header: 'Emptied',
    kind: 'text',
    value: (c) => (c.emptied === false ? 'Not emptied' : 'Yes'),
    cell: (c) => (c.emptied === false ? <Problem label="Not emptied" /> : <Muted>Yes</Muted>),
  },
  { id: 'tank', header: 'Target tank', kind: 'text', value: (c) => c.tankName },
];

const deviationCell = (l: DecantationReportTankLine): React.ReactNode => {
  if (l.densityDeviation === null) return '—';
  const text = formatDensity(l.densityDeviation, { plus: true });
  return Math.abs(l.densityDeviation) > DENSITY_TOLERANCE ? <Problem label={text} /> : text;
};

const LINE_COLUMNS: TableColumn<DecantationReportTankLine>[] = [
  {
    id: 'tank',
    header: 'Tank / product',
    kind: 'text',
    value: (l) => l.tankName,
    cell: (l) => <NameAndCode name={l.tankName} code={l.productName} />,
    width: '18%',
  },
  {
    id: 'before',
    header: 'Before dip',
    kind: 'qty',
    unit: 'mm',
    value: (l) => l.beforeDip,
    total: false,
  },
  {
    id: 'after',
    header: 'After dip',
    kind: 'qty',
    unit: 'mm',
    value: (l) => l.afterDip,
    total: false,
  },
  { id: 'sales', header: 'Sales during', kind: 'qty', unit: 'L', value: (l) => l.salesDuring },
  {
    id: 'received',
    header: 'Received',
    kind: 'qty',
    unit: 'L',
    value: (l) => l.receivedQty,
    cell: (l) => (l.receivedQty === null ? <Muted>Pending</Muted> : litres(l.receivedQty)),
  },
  {
    id: 'ro',
    header: 'RO density',
    kind: 'text',
    value: (l) => (l.roDensity === null ? null : formatDensity(l.roDensity)),
  },
  {
    id: 'invoiceDensity',
    header: 'Invoice density',
    kind: 'text',
    value: (l) => (l.invoiceDensity === null ? null : formatDensity(l.invoiceDensity)),
  },
  {
    id: 'deviation',
    header: 'Deviation',
    kind: 'text',
    value: (l) => l.densityDeviation,
    cell: deviationCell,
  },
];

const linkStatusCell = (link: DecantationReportInvoiceLink): React.ReactNode => {
  const waiting = linkState(link);
  if (waiting) {
    return (
      <StatusChip
        status={waiting.status}
        label={waiting.label}
        size="md"
        variant="outline"
        showIcon={false}
      />
    );
  }
  return <VarianceChip amount={link.varianceQty} kind="stock" size="md" variant="outline" />;
};

const LINK_COLUMNS: TableColumn<DecantationReportInvoiceLink>[] = [
  {
    id: 'product',
    header: 'Product',
    kind: 'text',
    value: (i) => i.productName,
    cell: (i) => <NameAndCode name={i.productName} code={i.productCode} />,
    width: '22%',
  },
  { id: 'invoice', header: 'Invoice', kind: 'text', value: (i) => i.invoiceNumber },
  { id: 'invoiceQty', header: 'Invoice qty', kind: 'qty', unit: 'L', value: (i) => i.invoiceQty },
  { id: 'received', header: 'Received', kind: 'qty', unit: 'L', value: (i) => i.receivedQty },
  {
    id: 'variance',
    header: 'Variance',
    kind: 'text',
    value: (i) => i.varianceQty,
    cell: (i) => linkStatusCell(i),
  },
];

const Fact: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({
  label,
  children,
  mono,
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-[12px] text-ink-muted">{label}</dt>
    <dd className={mono ? 'font-mono text-ink-strong' : 'text-ink-strong'}>{children}</dd>
  </div>
);

/** `05 Mar 2026, 10:00 am – 11:30 am`; the end keeps its date only when it is another day. */
function unloadWindow(start: string, end: string | null): string {
  if (!end) return formatDateTime(start);
  const sameDay = formatDate(start) === formatDate(end);
  return `${formatDateTime(start)} – ${sameDay ? formatTime(end) : formatDateTime(end)}`;
}

const Section: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <section className="flex flex-col gap-2">
    <SectionHeader title={title} subtitle={subtitle} />
    <div className="rounded-card border border-border-soft bg-surface p-2">{children}</div>
  </section>
);

export const DecantationVisitDrawer: React.FC<{
  visit: DecantationReportVisit;
  onClose: () => void;
}> = ({ visit, onClose }) => {
  const state = visitState(visit.status);
  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={`Tanker visit · ${visit.tankerNumber}`}
      widthVariant="wide"
    >
      <div className="flex flex-col gap-5 text-[13px]">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-border-soft bg-surface-alt p-4 sm:grid-cols-3">
          <Fact label="Business date">{formatDate(visit.date)}</Fact>
          <Fact label="Document" mono>
            {visit.documentNumber}
          </Fact>
          <Fact label="Driver">{visit.driverName || '—'}</Fact>
          <Fact label="Status">
            <StatusChip status={state.status} label={state.label} size="md" />
          </Fact>
          {visit.unloadStartedAt && (
            <Fact label="Unloaded">{unloadWindow(visit.unloadStartedAt, visit.unloadEndedAt)}</Fact>
          )}
        </dl>

        {visit.flags.length > 0 && (
          <div
            role="note"
            className="flex flex-col gap-1 rounded-card bg-danger-bg px-3.5 py-2.5 text-danger-fg"
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <Icon name="alert-triangle" size="sm" aria-hidden="true" /> Attention flags
            </div>
            <ul className="flex flex-col gap-0.5">
              {visit.flags.map((f, i) => (
                <li key={`${f.code}:${i}`}>{f.message}</li>
              ))}
            </ul>
          </div>
        )}

        <Section
          title="Chamber inspection (transit)"
          subtitle={
            visit.chamberSummary.hasTransitDiscrepancy ? (
              <StatusChip status="variance" label="Transit discrepancy found" size="md" />
            ) : (
              <StatusChip status="balanced" label="Seals and dips OK" size="md" />
            )
          }
        >
          <StatementTable
            columns={CHAMBER_COLUMNS}
            rows={visit.chambers}
            rowKey={(c) => c.id}
            totalRow={visit.chambers.length > 1 ? { label: 'Total capacity' } : undefined}
            label="Chamber inspection"
            emptyMessage="No chamber checks recorded for this visit."
          />
        </Section>

        <Section title="Underground tank dips">
          <StatementTable
            columns={LINE_COLUMNS}
            rows={visit.tankLines}
            rowKey={(l) => l.id}
            totalRow={visit.tankLines.length > 1 ? true : undefined}
            label="Underground tank dips"
            emptyMessage="No tank lines recorded for this visit."
          />
        </Section>

        <Section title="Invoice reconciliation">
          <StatementTable
            columns={LINK_COLUMNS}
            rows={visit.invoiceLinks}
            rowKey={(i, idx) => `${i.purchaseId ?? 'none'}:${i.productId}:${idx}`}
            label="Invoice reconciliation"
            emptyMessage="No invoices linked to this visit."
          />
        </Section>

        {visit.notes && (
          <section className="flex flex-col gap-2">
            <SectionHeader title="Operator notes" />
            <p className="rounded-card bg-surface-alt px-3 py-2">{visit.notes}</p>
          </section>
        )}
      </div>
    </Drawer>
  );
};
