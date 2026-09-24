import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveEntryDate } from '@pump/shared';
import { useDailyCashBook } from '../../query/hooks.js';
import type { DailyCashBookAccount, DailyCashBookEntry } from '../../services/cloud.js';
import { DateField } from '../primitives/Field.js';
import { Drawer } from '../Drawer.js';
import { inr } from '../../utils/format.js';
import { accountTypeLabel, ledgerSourceLabel } from '../../utils/ledgerLabels.js';
import { addDays, cashAccountTotals, sortCashBookAccounts } from '../../utils/cashBook.js';
import {
  Button,
  Chip,
  DateText,
  EmptyState,
  KpiStrip,
  KpiTile,
  Panel,
  StatementTable,
} from '../../pump-ds/index.js';

export interface DailyCashBookProps {
  selectedStation: any | null;
}

const th: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  textAlign: 'right',
};
const td: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '13px',
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
};

const signed = (n: number) => (n < 0 ? 'var(--state-danger-fg)' : 'var(--text-default)');

/**
 * Daily Cash Book (ADR 0005): each Financial Account's opening, money in, money
 * out and closing on one station-calendar date, computed live from the ledger.
 * Click an account to see that day's entries.
 */
export const DailyCashBook: React.FC<DailyCashBookProps> = ({ selectedStation }) => {
  const timeZone: string | undefined = selectedStation?.settings?.timezone;
  const today = resolveEntryDate({ timeZone });
  const [date, setDate] = useState<string>(today);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  const { data, isLoading, error } = useDailyCashBook(selectedStation?.id, date);

  const accounts = useMemo(() => sortCashBookAccounts(data?.accounts ?? []), [data]);
  const cash = useMemo(() => cashAccountTotals(accounts), [accounts]);
  const hasCashAccounts = accounts.some(
    (a) => a.accountType === 'CASH_IN_HAND' || a.accountType === 'PETTY_CASH',
  );
  const openAccount = accounts.find((a) => a.id === openAccountId) ?? null;

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', {
      timeZone: timeZone || 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<ChevronLeft />}
          aria-label="Previous day"
          onClick={() => setDate((d) => addDays(d, -1))}
        >
          Prev
        </Button>
        <div style={{ width: '160px' }}>
          <DateField
            aria-label="Cash book date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          rightIcon={<ChevronRight />}
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => setDate((d) => (d >= today ? d : addDays(d, 1)))}
        >
          Next
        </Button>
        {date !== today && (
          <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
            Today
          </Button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Office money by entry date (station calendar day). Shift cash lands on the date the shift
          was closed.
        </span>
      </div>

      {hasCashAccounts && (
        <KpiStrip columns={4}>
          <KpiTile dot="neutral" label="Cash opening" value={inr(cash.opening)} />
          <KpiTile dot="success" valueTone="success" label="Cash in" value={inr(cash.moneyIn)} />
          <KpiTile dot="danger" valueTone="danger" label="Cash out" value={inr(cash.moneyOut)} />
          <KpiTile dot="brand" label="Cash closing" value={inr(cash.closing)} />
        </KpiStrip>
      )}

      <Panel
        flush
        title={
          <>
            Daily Cash Book — <DateText value={date} />
          </>
        }
      >
        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        ) : error ? (
          <EmptyState
            title="Could not load the cash book"
            description={error.message || 'Try again in a moment.'}
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            description="Set up Cash in Hand and your bank accounts under Accounts to see a daily cash book."
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Account</th>
                <th style={th}>Opening</th>
                <th style={th}>In</th>
                <th style={th}>Out</th>
                <th style={th}>Closing</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setOpenAccountId(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenAccountId(a.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`${a.name} entries`}
                  style={{ borderTop: '1px solid var(--border-soft)', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                        {a.name}
                        {a.entries.length > 0 && (
                          <span
                            style={{
                              marginLeft: '6px',
                              fontSize: '11px',
                              fontWeight: 400,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {a.entries.length} {a.entries.length === 1 ? 'entry' : 'entries'}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {accountTypeLabel(a.accountType)}
                      </span>
                    </span>
                  </td>
                  <td style={{ ...td, color: signed(a.opening) }}>{inr(a.opening)}</td>
                  <td style={{ ...td, color: 'var(--state-success-fg)' }}>
                    {a.moneyIn ? inr(a.moneyIn) : '—'}
                  </td>
                  <td style={{ ...td, color: 'var(--state-danger-fg)' }}>
                    {a.moneyOut ? inr(a.moneyOut) : '—'}
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: signed(a.closing) }}>
                    {inr(a.closing)}
                  </td>
                </tr>
              ))}
            </tbody>
            {hasCashAccounts && (
              <tfoot>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    borderTop: '1px solid var(--border-strong)',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                    Cash total
                    <span
                      style={{
                        marginLeft: '6px',
                        fontSize: '11px',
                        fontWeight: 400,
                        color: 'var(--text-muted)',
                      }}
                    >
                      Cash in Hand + Petty Cash
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{inr(cash.opening)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{inr(cash.moneyIn)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{inr(cash.moneyOut)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{inr(cash.closing)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </Panel>

      <Drawer
        isOpen={!!openAccount}
        onClose={() => setOpenAccountId(null)}
        title={openAccount ? `${openAccount.name} · ${date}` : 'Entries'}
      >
        {openAccount && (
          <AccountDayEntries account={openAccount} timeOf={timeOf} key={openAccount.id} />
        )}
      </Drawer>
    </div>
  );
};

const AccountDayEntries: React.FC<{
  account: DailyCashBookAccount;
  timeOf: (iso: string) => string;
}> = ({ account, timeOf }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <Chip tone="neutral" size="xs">
        {accountTypeLabel(account.accountType)}
      </Chip>
      <span style={{ color: 'var(--text-muted)' }}>
        Opening <strong style={{ fontFamily: 'var(--font-mono)' }}>{inr(account.opening)}</strong> →
        Closing <strong style={{ fontFamily: 'var(--font-mono)' }}>{inr(account.closing)}</strong>
      </span>
    </div>
    <StatementTable<DailyCashBookEntry>
      label={`${account.name} entries`}
      rows={account.entries}
      rowKey={(e) => e.id}
      emptyMessage="No money moved through this account on this date."
      columns={[
        { header: 'Time', cell: (e) => timeOf(e.createdAt), width: '14%', mono: true },
        { header: 'Source', cell: (e) => ledgerSourceLabel(e.sourceType), width: '22%' },
        { header: 'Notes', cell: (e) => e.notes || '—' },
        {
          header: 'In',
          align: 'right',
          width: '16%',
          cell: (e) => (e.direction === 'in' ? inr(e.amount) : ''),
        },
        {
          header: 'Out',
          align: 'right',
          width: '16%',
          cell: (e) => (e.direction === 'out' ? inr(e.amount) : ''),
        },
      ]}
      total={['Total', '', '', inr(account.moneyIn), inr(account.moneyOut)]}
    />
  </div>
);
