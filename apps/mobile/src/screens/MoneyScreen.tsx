import React, { useState } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl.js';
import { useNav } from '../shell/nav.js';
import type { MoneyCustomer, MoneySupplier } from '../lib/money/parties.js';
import { CustomerPage } from './money/CustomerPage.js';
import { SearchField } from './money/SearchField.js';
import { ToCollect } from './money/ToCollect.js';
import { ToPay } from './money/ToPay.js';

type List = 'collect' | 'pay';

const LISTS = [
  { value: 'collect', label: 'To collect' },
  { value: 'pay', label: 'To pay' },
] as const;

interface Props {
  /**
   * What a supplier row opens. The Supplier page (#397) passes itself in here
   * from `TabRoot`; until then supplier rows are not tappable.
   */
  renderSupplierPage?: (supplier: MoneySupplier) => React.ReactNode;
}

/**
 * Money tab: who owes you (To collect) and whom you owe (To pay). Rows open a
 * detail page on the Money stack. The tab root stays mounted while a page is
 * open, so the list, search and scroll are where you left them.
 */
export const MoneyScreen: React.FC<Props> = ({ renderSupplierPage }) => {
  const nav = useNav();
  const [list, setList] = useState<List>('collect');
  const [query, setQuery] = useState('');

  const switchList = (next: List) => {
    setList(next);
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-2.5 pb-4">
      <div className="px-3">
        <SegmentedControl
          label="Money list"
          options={LISTS}
          value={list}
          onChange={switchList}
          className=""
        />
      </div>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={list === 'collect' ? 'Search customers' : 'Search suppliers'}
      />
      <div>
        {list === 'collect' ? (
          <ToCollect
            query={query}
            onOpenCustomer={(c: MoneyCustomer) =>
              nav.push(<CustomerPage customer={c} />, `customer:${c.id}`)
            }
          />
        ) : (
          <ToPay
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
