import React, { useState } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl.js';
import { useNav } from '../shell/nav.js';
import type { Station } from '@pump/shared';
import type { MoneyCustomer, MoneySupplier } from '../lib/money/parties.js';
import { CustomerPage } from './money/CustomerPage.js';
import { SearchField } from './money/SearchField.js';
import { ToCollect } from './money/ToCollect.js';
import { ToPay } from './money/ToPay.js';

type List = 'collect' | 'pay';

const isList = (v: string): v is List => v === 'collect' || v === 'pay';

const LISTS = [
  { value: 'collect', label: 'To collect' },
  { value: 'pay', label: 'To pay' },
] as const;

interface Props {
  /** The selected Station: its clock ages the receivables and payables. Null while stations load; the Money tab works without it, minus the aging and the payables summary. */
  station?: Station | null;
  /**
   * What a supplier row opens. `TabRoot` passes the Supplier page in here;
   * unset, supplier rows are plain, non-tappable rows.
   */
  renderSupplierPage?: (supplier: MoneySupplier) => React.ReactNode;
}

/**
 * Money tab: who owes you (To collect) and whom you owe (To pay). Rows open a
 * detail page on the Money stack. The tab root stays mounted while a page is
 * open, so the list, search and scroll are where you left them.
 */
export const MoneyScreen: React.FC<Props> = ({ station = null, renderSupplierPage }) => {
  const nav = useNav();
  const [list, setList] = useState<List>('collect');
  const [query, setQuery] = useState('');
  // Home's To pay tile asks for a segment (`nav.select('money', { view })`); apply each request once.
  const request = nav.views.money;
  const [applied, setApplied] = useState(0);
  if (request && request.seq !== applied) {
    setApplied(request.seq);
    if (isList(request.view) && request.view !== list) {
      setList(request.view);
      setQuery('');
    }
  }

  const switchList = (next: List) => {
    setList(next);
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-2.5 pb-4">
      <SegmentedControl label="Money list" options={LISTS} value={list} onChange={switchList} />
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={list === 'collect' ? 'Search customers' : 'Search suppliers'}
      />
      <div>
        {list === 'collect' ? (
          <ToCollect
            stationId={station?.id}
            query={query}
            onOpenCustomer={(c: MoneyCustomer) =>
              nav.push(<CustomerPage customer={c} station={station} />, `customer:${c.id}`)
            }
          />
        ) : (
          <ToPay
            stationId={station?.id}
            query={query}
            onOpenSupplier={
              renderSupplierPage &&
              ((s: MoneySupplier) => nav.push(renderSupplierPage(s), `supplier:${s.id}`))
            }
          />
        )}
      </div>
    </div>
  );
};
