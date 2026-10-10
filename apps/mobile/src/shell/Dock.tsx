import React from 'react';
import { TAB_ICONS } from './tabIcons.js';
import { tabDef } from './tabs.js';
import type { TabKey } from '../lib/tabKey.js';

interface Props {
  tabs: readonly TabKey[];
  active: TabKey;
  onSelect: (tab: TabKey) => void;
}

/**
 * Floating icon-only tab bar. Hidden while a detail page is showing.
 * The tabs sit in equal columns; one pill slides under the active tab (a
 * transform, so it stays on the compositor), and holds still under reduced motion.
 */
export const Dock: React.FC<Props> = ({ tabs, active, onSelect }) => {
  const index = Math.max(0, tabs.indexOf(active));
  return (
    <nav
      aria-label="Main"
      className="absolute inset-x-3.5 z-20 grid rounded-[22px] border border-dock-line bg-dock p-[7px] shadow-float backdrop-blur-xl"
      style={{ bottom: 'var(--dock-gap)', gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
    >
      <span
        aria-hidden="true"
        data-dock-pill
        className="pointer-events-none absolute left-[7px] top-[7px] transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - 14px) / ${tabs.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      >
        <span className="mx-auto block h-11 w-[54px] rounded-[14px] bg-accent" />
      </span>
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
            className={`relative grid h-11 w-[54px] place-items-center justify-self-center rounded-[14px] transition-colors duration-200 ease-out motion-reduce:transition-none ${
              on ? 'text-on-accent' : 'text-text-faint'
            }`}
          >
            <Icon size={21} strokeWidth={2} />
          </button>
        );
      })}
    </nav>
  );
};
