import type React from 'react';
import {
  HomeIcon,
  InsightsIcon,
  MoneyIcon,
  ReportsIcon,
  ShiftsIcon,
  type IconProps,
} from '../ui/icons.js';
import type { TabKey } from '../lib/tabKey.js';

/** The dock glyph of each tab. */
export const TAB_ICONS: Record<TabKey, React.FC<IconProps>> = {
  home: HomeIcon,
  shifts: ShiftsIcon,
  reports: ReportsIcon,
  money: MoneyIcon,
  insights: InsightsIcon,
};
