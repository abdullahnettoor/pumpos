import React, { useState } from 'react';
import { inr } from '@pump/ui';
import {
  matchName,
  overLimitCount,
  owing,
  sortByBalance,
  totalOwed,
  type MoneyCustomer,
} from '../../lib/money/parties.js';
import { ListGroup } from '../../ui/ListRow.js';
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { SeeAllButton } from '../../ui/SeeAllButton.js';
import { CustomerRow } from './CustomerRow.js';
import { HeroCard } from './HeroCard.js';
import { AgingSplit } from './AgingSplit.js';
import { useCustomersData, useReceivablesData } from './useMoneyData.js';

/** Customers shown before "See all". */
export const PREVIEW_COUNT = 5;

interface Props {
  /** The Station whose clock ages the receivables; without one the aging and "Oldest" are left out. */
  stationId?: string | null;
  query: string;
  onOpenCustomer: (customer: MoneyCustomer) => void;
}

/**
 * To collect: what customers owe (Σ credit sales − Σ collections), largest first.
 * Only customers who owe are listed; a search looks across all of them, so a
 * settled customer can still be found and opened. The hero carries the aging
 * split and each row how long its oldest debt has waited; both come from the
 * receivables summary and are simply left out until it arrives (or fails).
 */
export const ToCollect: React.FC<Props> = ({ stationId, query, onOpenCustomer }) => {
  const { customers, isLoading } = useCustomersData();
  const receivables = useReceivablesData(stationId);
  const [expanded, setExpanded] = useState(false);
  const searching = query.trim() !== '';

  const owingNow = owing(customers);
  const rows = sortByBalance(matchName(searching ? customers : owingNow, query));
  const shown = searching || expanded ? rows : rows.slice(0, PREVIEW_COUNT);
  const overCount = overLimitCount(customers);

  if (isLoading && customers.length === 0) return <Note>Loading customers…</Note>;

  return (
    <>
      <HeroCard
        label={`Receivables · ${owingNow.length} ${owingNow.length === 1 ? 'customer' : 'customers'}`}
        value={inr(totalOwed(customers))}
      >
        {overCount > 0 && (
          <p className="mt-1 text-[11.5px] font-semibold text-bad-fg">
            {overCount} over credit limit
          </p>
        )}
        <AgingSplit aging={receivables.summary?.aging} />
      </HeroCard>
      <SectionLabel>{searching ? 'Customers' : 'Highest balances'}</SectionLabel>
      {rows.length === 0 ? (
        <Note>
          {searching ? `No customers match “${query.trim()}”.` : 'Nobody owes you right now.'}
        </Note>
      ) : (
        <ListGroup>
          {shown.map((c) => (
            <CustomerRow
              key={c.id}
              customer={c}
              oldestUnpaidDays={receivables.byCustomer.get(c.id)?.oldestUnpaidDays}
              onPress={() => onOpenCustomer(c)}
            />
          ))}
        </ListGroup>
      )}
      {!searching && !expanded && rows.length > PREVIEW_COUNT && (
        <SeeAllButton onClick={() => setExpanded(true)}>
          See all {rows.length} customers
        </SeeAllButton>
      )}
    </>
  );
};
