import React from 'react';
import { DashboardCard } from '../frame/DashboardCard.js';

/** Placeholder — filled in by #507 (Staff "Your shift"). Owns its file; keep the export name. */
export const YourShiftCard: React.FC = () => (
  <DashboardCard card="yourShift" title="Your shift" placeholderHeight={160}>
    <div className="h-[160px]" />
  </DashboardCard>
);
