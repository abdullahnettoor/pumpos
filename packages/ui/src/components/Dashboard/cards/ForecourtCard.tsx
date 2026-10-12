import React from 'react';
import { DashboardCard } from '../frame/DashboardCard.js';

/** Placeholder — filled in by #504 (Forecourt). Owns its file; keep the export name. */
export const ForecourtCard: React.FC = () => (
  <DashboardCard card="forecourt" title="Forecourt" placeholderHeight={220}>
    <div className="h-[220px]" />
  </DashboardCard>
);
