import React from 'react';
import { inr } from '@pump/ui';
import {
  balanceOf,
  matchName,
  owing,
  sortByBalance,
  totalOwed,
  type MoneySupplier,
} from '../../lib/money/parties.js';
import { Avatar } from '../../ui/Avatar.js';
import { ListGroup, ListRow } from '../../ui/ListRow.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { MoneyHero } from './MoneyHero.js';
import { Note } from './parts.js';
import { useSuppliersData } from './useMoneyData.js';

interface Props {
  query: string;
  /**
   * Opens a supplier's page. Unset until the Supplier page (#397) exists: the
   * rows then render as plain, non-tappable rows.
   */
  onOpenSupplier?: (supplier: MoneySupplier) => void;
}

/** A supplier carries no category or payment terms, so the line under the name is its trade name or phone. */
const metaOf = (s: MoneySupplier): string => s.metadata?.tradeName || s.phone || '';

/**
 * To pay: what you owe suppliers (Σ purchases − Σ payments), largest first.
 * No due dates: suppliers have no payment terms in the data. Payables-summary
 * figures (paid / purchased this month) join the hero in the payables ticket.
 */
export const ToPay: React.FC<Props> = ({ query, onOpenSupplier }) => {
  const { suppliers, isLoading } = useSuppliersData();
  const searching = query.trim() !== '';
  const owedNow = owing(suppliers);
  const rows = sortByBalance(matchName(searching ? suppliers : owedNow, query));

  if (isLoading && suppliers.length === 0) return <Note>Loading suppliers…</Note>;

  return (
    <>
      <MoneyHero
        label={`Payables · ${owedNow.length} ${owedNow.length === 1 ? 'supplier' : 'suppliers'}`}
        value={inr(totalOwed(suppliers))}
      />
      <SectionLabel>Suppliers</SectionLabel>
      {rows.length === 0 ? (
        <Note>
          {searching ? `No suppliers match “${query.trim()}”.` : 'You owe no supplier right now.'}
        </Note>
      ) : (
        <ListGroup>
          {rows.map((s) => {
            const balance = balanceOf(s);
            return (
              <ListRow
                key={s.id}
                leading={<Avatar name={s.name} />}
                title={s.name}
                meta={metaOf(s)}
                end={
                  balance < 0 ? (
                    <span className="num text-good">{inr(-balance)} advance</span>
                  ) : (
                    <span className="num">{inr(balance)}</span>
                  )
                }
                onPress={onOpenSupplier && (() => onOpenSupplier(s))}
              />
            );
          })}
        </ListGroup>
      )}
    </>
  );
};
