import React from 'react';

export type TabKey = 'home' | 'shifts' | 'dssr' | 'ledger';

interface NavItem {
  key: TabKey;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: '◈' },
  { key: 'shifts', label: 'Shifts', icon: '⛽' },
  { key: 'dssr', label: 'DSSR', icon: '▤' },
  { key: 'ledger', label: 'Ledger', icon: '₹' },
];

interface BottomNavProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
  /** Tabs the current role is allowed to see. */
  allowed: TabKey[];
}

export const BottomNav: React.FC<BottomNavProps> = ({ active, onChange, allowed }) => {
  const items = ITEMS.filter((i) => allowed.includes(i.key));
  return (
    <nav
      className="mobile-safe-bottom sticky bottom-0 z-20 grid border-t px-2 pt-1"
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-soft)',
      }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition"
            style={{ color: isActive ? 'var(--brand-primary)' : 'var(--text-muted)' }}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
};
