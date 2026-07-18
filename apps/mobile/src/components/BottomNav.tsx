import React from 'react';

export type TabKey = 'home' | 'shifts' | 'dssr' | 'ledger' | 'handover';

type IconProps = { size?: number };
const makeIcon = (children: React.ReactNode): React.FC<IconProps> =>
  function Icon({ size = 22 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };

const HomeIcon = makeIcon(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </>,
);
const ShiftsIcon = makeIcon(
  <>
    <path d="M4 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" />
    <path d="M3 21h11" />
    <path d="M7 8h3" />
    <path d="M13 10h3l3 3v5a1.5 1.5 0 0 1-3 0v-4h-3" />
    <path d="M16 7V5l-2-2" />
  </>,
);
const DssrIcon = makeIcon(
  <>
    <path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <path d="M14 2v5h5" />
    <path d="M8 13h8M8 17h5" />
  </>,
);
const LedgerIcon = makeIcon(
  <>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14.5" r="1.2" />
  </>,
);
const HandoverIcon = makeIcon(
  <>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z" />
    <path d="M9 11h6M9 15h4" />
  </>,
);

interface NavItem {
  key: TabKey;
  label: string;
  Icon: React.FC<IconProps>;
}

const ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'shifts', label: 'Shifts', Icon: ShiftsIcon },
  { key: 'dssr', label: 'DSSR', Icon: DssrIcon },
  { key: 'ledger', label: 'Ledger', Icon: LedgerIcon },
  { key: 'handover', label: 'Handover', Icon: HandoverIcon },
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
      {items.map(({ key, label, Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition"
            style={{ color: isActive ? 'var(--brand-primary)' : 'var(--text-muted)' }}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon />
            {label}
          </button>
        );
      })}
    </nav>
  );
};
