import React from 'react';
import { TAB_ICONS } from './tabIcons.js';
import { tabDef, type TabKey } from './tabs.js';

interface Props {
  tabs: readonly TabKey[];
  active: TabKey;
  onSelect: (tab: TabKey) => void;
}

/** Floating icon-only tab bar. Hidden while a detail page is showing. */
export const Dock: React.FC<Props> = ({ tabs, active, onSelect }) => (
  <nav
    aria-label="Main"
    className="absolute inset-x-3.5 z-20 flex justify-around rounded-[22px] border border-dock-line bg-dock p-[7px] shadow-float backdrop-blur-xl"
    style={{ bottom: 'var(--dock-gap)' }}
  >
    {tabs.map((key) => {
      const Icon = TAB_ICONS[key];
      const on = key === active;
      return (
        <button
          key={key}
          type="button"
          aria-label={tabDef(key).label}
          aria-current={on ? 'page' : undefined}
          onClick={() => onSelect(key)}
          className={`grid h-11 w-[54px] place-items-center rounded-[14px] ${
            on ? 'bg-accent text-on-accent' : 'text-text-faint'
          }`}
        >
          <Icon size={21} strokeWidth={2} />
        </button>
      );
    })}
  </nav>
);
