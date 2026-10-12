import React from 'react';
import { DashboardCard } from '../frame/DashboardCard.js';

/** Placeholder — filled in by #509 (Timeline). Owns its file; keep the export name. */
export const TimelineCard: React.FC = () => (
  <DashboardCard card="timeline" title="Timeline" placeholderHeight={120}>
    <div className="h-[120px]" />
  </DashboardCard>
);
