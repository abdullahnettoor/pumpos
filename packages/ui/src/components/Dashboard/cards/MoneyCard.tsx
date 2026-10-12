import React from 'react';
import { DashboardCard } from '../frame/DashboardCard.js';

/** Placeholder — filled in by #506 (Money). Owns its file; keep the export name. */
export const MoneyCard: React.FC = () => (
  <DashboardCard card="money" title="Money" placeholderHeight={260}>
    <div className="h-[260px]" />
  </DashboardCard>
);
