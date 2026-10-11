import React from 'react';
import { compactRupees } from '../../lib/format.js';
import type { MoneyPosition as Money } from '../../lib/home/figures.js';
import { useNav } from '../../shell/nav.js';
import { StatTile } from '../../ui/index.js';

/** To collect / To pay: each opens Money on its own segment (when the Role has it). */
export const MoneyPosition: React.FC<{ money: Money }> = ({ money }) => {
  const nav = useNav();
  const canOpen = nav.tabs.includes('money');
  const tile = (
    label: string,
    line: Money['toCollect'],
    tone: 'warn' | 'default',
    list: 'collect' | 'pay',
  ) => {
    const card = (
      <StatTile
        label={label}
        value={compactRupees(line.value)}
        sub={line.detail}
        tone={line.value > 0 ? tone : 'default'}
      />
    );
    return canOpen ? (
      <button
        type="button"
        onClick={() => nav.select('money', { view: list })}
        className="block text-left"
      >
        {card}
      </button>
    ) : (
      card
    );
  };
  return (
    <div className="grid grid-cols-2 gap-2 px-3">
      {tile('To collect', money.toCollect, 'warn', 'collect')}
      {tile('To pay', money.toPay, 'default', 'pay')}
    </div>
  );
};
