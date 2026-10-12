import React from 'react';
import { DashboardCard } from '../frame/DashboardCard.js';

/** Placeholder — filled in by #505 (Fuels). Owns its file; keep the export name. */
export const FuelsCard: React.FC = () => (
  <DashboardCard card="fuels" title="Fuels" placeholderHeight={320}>
    <div className="h-[320px]" />
  </DashboardCard>
);
