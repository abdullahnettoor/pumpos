import React, { useMemo } from 'react';
import { Drawer } from '../Drawer.js';
import {
  StatementView,
  buildLedgerStatement,
  partyEntries,
  type StatementClock,
} from '../../statement/index.js';
import type { ReceivablesSummary } from '@pump/shared';
import { Button, DataSection, Icon, StatusChip } from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { useCustomerLedger } from '../../query/hooks.js';
import { CustomerTypeChip } from './columns.js';
import {
  creditLineOf,
  receivablesByCustomer,
  standingOf,
  type CustomerStanding,
} from './customerStanding.js';

interface StatementDrawerProps {
  /** Selected customer; null closes the drawer. */
  customer: any | null;
  stationId: string | null;
  /** The station clock: dates a row the server sent no date for. */
  clock?: StatementClock;
  onClose: () => void;
  /** Open the edit-profile drawer for this customer (container closes statement). */
  onEdit: (customer: any) => void;
  /** Open the collection drawer pre-filled for this customer. */
  onRecordCollection: (customer: any) => void;
  /** The server's receivables summary, when the Role may read it: the figure and its age. */
  receivables?: ReceivablesSummary;
}

/**
 * Customer account statement: summary card + full ledger + quick actions.
 * Fetches the ledger via `useCustomerLedger` (cached).
 */
export const StatementDrawer: React.FC<StatementDrawerProps> = ({
  customer,
  stationId,
  clock,
  onClose,
  onEdit,
  onRecordCollection,
  receivables,
}) => {
  const ledgerQ = useCustomerLedger(customer?.id);
  // All-time ledger: no opening balance, the running balance starts at zero.
  const timeZone = clock?.timeZone;
  const dayStartsAt = clock?.dayStartsAt;
  const statement = useMemo(
    () =>
      buildLedgerStatement(partyEntries(ledgerQ.data ?? [], 'customer'), {
        kind: 'customer',
        clock: { timeZone, dayStartsAt },
      }),
    [ledgerQ.data, timeZone, dayStartsAt],
  );

  const standing = useMemo(
    () => (customer ? standingOf(customer, receivablesByCustomer(receivables)) : null),
    [customer, receivables],
  );

  return (
    <Drawer
      isOpen={customer !== null}
      onClose={onClose}
      title="Customer account statement"
      widthVariant="wide"
    >
      {customer && (
        <div className="flex flex-col gap-5">
          <SummaryCard customer={customer} standing={standing!} />

          {/* Ledger: the Statement module, oldest first, Debit · Credit · Balance */}
          <section className="flex flex-col gap-2">
            <h4 className="text-[13px] font-semibold text-ink-strong">Statement of account</h4>
            <DataSection
              title="statement"
              query={ledgerQ}
              enabled
              placeholderHeight={200}
              shape="bare"
            >
              <StatementView
                statement={statement}
                scrollToEnd
                label={`${customer.name} statement`}
                emptyMessage="No transaction history found for this account."
              />
            </DataSection>
          </section>

          <div className="mt-2 flex gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="edit" size="sm" />}
              onClick={() => onEdit(customer)}
            >
              Edit profile
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="wallet" size="sm" />}
              onClick={() => onRecordCollection(customer)}
            >
              Record collection
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-ink-muted">{label}</dt>
    <dd className="font-mono font-semibold text-ink-strong">{children}</dd>
  </div>
);

/**
 * Who the customer is and where they stand: "Owes you" (the receivable), or
 * the advance held for them, as a plain figure. A problem shows as its
 * status chip (Over limit, Overdue), never as a coloured figure.
 */
const SummaryCard: React.FC<{ customer: any; standing: CustomerStanding }> = ({
  customer,
  standing,
}) => {
  const limit = creditLineOf(customer);
  const advance = standing.receivable <= 0 && standing.advance > 0;
  const meta = customer.metadata ?? {};
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface-alt p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h3 className="text-[15px] font-semibold text-ink-strong">{customer.name}</h3>
          <span className="flex flex-wrap items-center gap-1">
            <CustomerTypeChip type={customer.customerType} />
            {standing.overLimitBy > 0 && <StatusChip status="over-limit" size="xs" />}
            {standing.overdueDays != null && (
              <StatusChip status="overdue" size="xs" label={`Overdue ${standing.overdueDays}d`} />
            )}
            {customer.isActive === false && <StatusChip status="inactive" size="xs" />}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] text-ink-muted">{advance ? 'Advance held' : 'Owes you'}</div>
          <div className="font-mono text-[18px] font-semibold text-ink-strong">
            {formatMoney(advance ? standing.advance : standing.receivable)}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-border-soft pt-2.5 text-[12px]">
        <Fact label="Credit limit">{limit > 0 ? formatMoney(limit) : 'None'}</Fact>
        {limit > 0 && (
          <Fact label="Available credit">
            {formatMoney(Math.max(0, limit - standing.receivable))}
          </Fact>
        )}
      </dl>

      {customer.isPrepaid && (
        <p className="flex items-center gap-1.5 border-t border-border-soft pt-2.5 text-[12px] text-ink-muted">
          <Icon name="wallet" size="xs" /> OMC fleet card: fuel is settled to the OMC (CMS account),
          not billed to this customer.
        </p>
      )}

      {(meta.gstin || meta.pan || meta.billingAddress) && (
        <dl className="flex flex-col gap-1 border-t border-border-soft pt-2.5 text-[12px] text-ink-muted">
          {meta.gstin && (
            <div className="flex gap-1">
              <dt className="font-semibold">GSTIN</dt>
              <dd className="font-mono">{meta.gstin}</dd>
            </div>
          )}
          {meta.pan && (
            <div className="flex gap-1">
              <dt className="font-semibold">PAN</dt>
              <dd className="font-mono">{meta.pan}</dd>
            </div>
          )}
          {meta.billingAddress && (
            <div className="flex gap-1">
              <dt className="font-semibold">Billing address</dt>
              <dd>{meta.billingAddress}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
};
