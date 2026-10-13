import React from 'react';
import { canViewInventoryNav, resolveDecantationSettings } from '@pump/shared';
import { useDensityTodaySummary } from '../../../query/hooks.js';
import { FuelsCard } from '../cards/FuelsCard.js';
import { ColumnHeader } from '../frame/ColumnHeader.js';
import { useDashboard } from '../frame/DashboardContext.js';

/** Middle column: Fuels (price, density, tanks, decantation). */
export const FuelsColumn: React.FC = () => {
  const { onNavigate, station, businessDate, role } = useDashboard();
  const densityQ = useDensityTodaySummary(station.id, businessDate);
  const products = densityQ.data?.products ?? [];
  const firstDay =
    products.length > 0 &&
    products.every((p) => !p.trend14d.some((t) => t.date < businessDate && t.density15 != null));
  const tolerance = resolveDecantationSettings(station.settings).densityToleranceKgM3;
  const footnote = firstDay
    ? 'Opening stock from onboarding. Record the morning density for each fuel.'
    : `Density changes over ±${tolerance.toFixed(1)} kg/m³ without a decantation are flagged.`;
  return (
    <>
      <ColumnHeader
        title="Fuels"
        subtitle="price · density · stock"
        action={
          canViewInventoryNav(role)
            ? { label: 'Inventory', onClick: () => onNavigate('/inventory') }
            : undefined
        }
      />
      <FuelsCard />
      <p className="px-1 text-[11.5px] text-ink-muted">{footnote}</p>
    </>
  );
};
