import React from 'react';

export interface IconProps {
  size?: number;
  strokeWidth?: number;
}

const makeIcon = (children: React.ReactNode): React.FC<IconProps> =>
  function Icon({ size = 20, strokeWidth = 1.9 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };

export const HomeIcon = makeIcon(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </>,
);
export const ShiftsIcon = makeIcon(
  <>
    <path d="M4 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" />
    <path d="M3 21h11" />
    <path d="M7 8h3" />
    <path d="M13 10h3l3 3v5a1.5 1.5 0 0 1-3 0v-4h-3" />
    <path d="M16 7V5l-2-2" />
  </>,
);
export const ReportsIcon = makeIcon(
  <>
    <path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <path d="M14 2v5h5" />
    <path d="M8 13h8M8 17h5" />
  </>,
);
export const MoneyIcon = makeIcon(
  <>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14.5" r="1.2" />
  </>,
);
export const InsightsIcon = makeIcon(
  <>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M3 20h18" />
  </>,
);
export const HandoverIcon = makeIcon(
  <>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z" />
    <path d="M9 11h6M9 15h4" />
  </>,
);

export const BellIcon = makeIcon(
  <>
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>,
);
export const ChevronRightIcon = makeIcon(<path d="m9 6 6 6-6 6" />);
export const ChevronDownIcon = makeIcon(<path d="m6 9 6 6 6-6" />);
export const BackIcon = makeIcon(<path d="m15 6-6 6 6 6" />);
export const PlusIcon = makeIcon(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = makeIcon(<path d="M5 12h14" />);
export const CheckIcon = makeIcon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const ShareIcon = makeIcon(
  <>
    <path d="M12 3v12" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </>,
);
export const DownloadIcon = makeIcon(
  <>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </>,
);
export const LockIcon = makeIcon(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
export const BuildingIcon = makeIcon(
  <>
    <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
    <path d="M15 10h4a1 1 0 0 1 1 1v10" />
    <path d="M3 21h18" />
    <path d="M8 8h3M8 12h3M8 16h3" />
  </>,
);
export const SignOutIcon = makeIcon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </>,
);
export const PhoneIcon = makeIcon(
  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
);
export const SearchIcon = makeIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
