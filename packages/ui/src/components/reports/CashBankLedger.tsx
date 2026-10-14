import React, { useMemo, useState } from 'react';
import { useFinanceMovements } from '../../query/hooks.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { Segmented } from '../primitives/Segmented.js';
import { StatementView, buildLedgerStatement, moneyEntries } from '../../statement/index.js';
import { inr } from '../../utils/format.js';
import { DataSection, KpiStrip, KpiTile, Panel } from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';

export interface CashBankLedgerProps {
  selectedStation: any | null;
}

const GROUP: Record<string, 'Cash' | 'Bank'> = {
  CASH_IN_HAND: 'Cash',
  PETTY_CASH: 'Cash',
  BANK: 'Bank',
};

/**
 * Cash & Bank ledger (Phase L3, repriced in FA6): a period statement of the
 * persisted money ledger, grouped Cash (cash-in-hand + petty cash) vs Bank. Now
 * reads the authoritative `ledger_entries` (shift sales, collections, expenses,
 * transfers, settlements, charges) — the live cash position, not a derived
 * subset. Rows, running balance and closing come from the Statement module
 * (receipt = Debit, payment = Credit). Per-account statements live on the Accounts page.
 */
export const CashBankLedger: React.FC<CashBankLedgerProps> = ({ selectedStation }) => {
  const s = selectedStation?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [account, setAccount] = useState<'Cash' | 'Bank'>('Cash');

  const ledgerQ = useFinanceMovements({
    stationId: selectedStation?.id,
    from: range.from,
    to: range.to,
  });
  const data = ledgerQ.data;
  // One statement of the selected group (Cash = cash in hand + petty cash; Bank),
  // opening carried from before the range (Σ in − out, computed server-side).
  const statement = useMemo(() => {
    const opening = (data?.openings || [])
      .filter((o: any) => GROUP[o.accountType] === account)
      .reduce((acc: number, o: any) => acc + Number(o.opening || 0), 0);
    const movements = (data?.movements || []).filter((m: any) => GROUP[m.accountType] === account);
    return buildLedgerStatement(
      moneyEntries(movements, {
        detail: (m) => [m.accountName, m.notes].filter(Boolean).join(' · '),
      }),
      { kind: 'account', opening },
    );
  }, [data, account]);
  const opening = statement.opening ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        note={
          <>
            Live {account.toLowerCase()} movements from the money ledger (shift sales, collections,
            expenses, transfers &amp; settlements). Opening balance carries the closing position
            from before the selected range; closing = opening + in − out.
          </>
        }
        actions={
          <div className="min-w-[200px]">
            <Segmented
              options={[
                { value: 'Cash', label: 'Cash' },
                { value: 'Bank', label: 'Bank' },
              ]}
              value={account}
              onChange={(v) => setAccount(v)}
              aria-label="Account"
            />
          </div>
        }
      />

      <KpiStrip columns="auto">
        <KpiTile
          dot={opening < 0 ? 'danger' : 'brand'}
          valueTone={opening < 0 ? 'danger' : undefined}
          label="Opening Balance"
          value={inr(opening)}
        />
        <KpiTile
          dot="success"
          valueTone="success"
          label="Money In"
          value={inr(statement.totals.debit)}
        />
        <KpiTile
          dot="danger"
          valueTone="danger"
          label="Money Out"
          value={inr(statement.totals.credit)}
        />
        <KpiTile
          dot={statement.closing < 0 ? 'danger' : 'brand'}
          valueTone={statement.closing < 0 ? 'danger' : undefined}
          label="Closing Balance"
          value={inr(statement.closing)}
        />
      </KpiStrip>

      <Panel title={`${account} ledger`}>
        <DataSection
          title={`${account.toLowerCase()} ledger`}
          query={ledgerQ}
          placeholderHeight={240}
          shape="bare"
        >
          <StatementView
            statement={statement}
            label={`${account} ledger`}
            emptyMessage={`No ${account.toLowerCase()} movements in this range.`}
          />
        </DataSection>
      </Panel>
    </div>
  );
};
