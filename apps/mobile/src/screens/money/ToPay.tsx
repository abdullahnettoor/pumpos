import React from 'react';
import { inr } from '@pump/ui';
import { compactRupees } from '../../lib/format.js';
import { sinceLabel, supplierRowMeta } from '../../lib/money/payables.js';
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
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { BalanceFigure } from './BalanceFigure.js';
import { HeroCard } from './HeroCard.js';
import { usePayablesData, useSuppliersData } from './useMoneyData.js';

interface Props {
  /** The Station whose clock anchors this month and the age of unpaid Purchases; without one the month figures and "N unpaid" are left out. */
  stationId?: string | null;
  query: string;
  /**
   * Opens a supplier's page. Unset, the rows render as plain, non-tappable rows.
   */
  onOpenSupplier?: (supplier: MoneySupplier) => void;
}

/**
 * Suppliers carry no category or payment terms (metadata is gstin, pan,
 * tradeName, billingAddress), so the line under the name is its trade name or phone.
 */
const metaOf = (s: MoneySupplier): string => s.metadata?.tradeName || s.phone || '';

/**
 * To pay: what you owe suppliers (Σ purchases − Σ payments), largest first. The
 * hero carries paid vs purchased this month and each row how many Purchases are
 * unpaid and since when; both come from the payables summary and are simply left
 * out until it arrives (or fails). No due dates: suppliers have no payment terms
 * in the data, so a row only says how long the oldest unpaid Purchase has waited.
 */
export const ToPay: React.FC<Props> = ({ stationId, query, onOpenSupplier }) => {
  const { suppliers, isLoading } = useSuppliersData();
  const payables = usePayablesData(stationId);
  const searching = query.trim() !== '';
  const owedNow = owing(suppliers);
  const rows = sortByBalance(matchName(searching ? suppliers : owedNow, query));

  if (isLoading && suppliers.length === 0) return <Note>Loading suppliers…</Note>;

  return (
    <>
      <HeroCard
        label={`Payables · ${owedNow.length} ${owedNow.length === 1 ? 'supplier' : 'suppliers'}`}
        value={inr(totalOwed(suppliers))}
      >
        {payables.summary && (
          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5 text-[11px] text-text-muted">
            <div>
              <dt>Paid this month</dt>
              <dd className="num text-[12.5px] font-semibold text-text-high">
                {compactRupees(payables.summary.month.paid)}
              </dd>
            </div>
            <div>
              <dt>Purchased this month</dt>
              <dd className="num text-[12.5px] font-semibold text-text-high">
                {compactRupees(payables.summary.month.purchased)}
              </dd>
            </div>
          </dl>
        )}
      </HeroCard>
      <SectionLabel>Suppliers</SectionLabel>
      {rows.length === 0 ? (
        <Note>
          {searching ? `No suppliers match “${query.trim()}”.` : 'You owe no supplier right now.'}
        </Note>
      ) : (
        <ListGroup>
          {rows.map((s) => {
            const payable = payables.bySupplier.get(s.id);
            const since = sinceLabel(payable);
            return (
              <ListRow
                key={s.id}
                leading={<Avatar name={s.name} />}
                title={s.name}
                meta={supplierRowMeta(metaOf(s), payable)}
                end={
                  <BalanceFigure
                    balance={balanceOf(s)}
                    caption={since ? { text: since, tone: 'muted' } : null}
                  />
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
