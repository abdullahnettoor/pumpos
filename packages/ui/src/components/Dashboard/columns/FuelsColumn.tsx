import React from 'react';
import { FuelsCard } from '../cards/FuelsCard.js';
import { ColumnHeader } from '../frame/ColumnHeader.js';
import { useDashboard } from '../frame/DashboardContext.js';

/** Middle column: Fuels (price, density, tanks, decantation). */
export const FuelsColumn: React.FC = () => {
  const { onNavigate } = useDashboard();
  return (
    <>
      <ColumnHeader
        title="Fuels"
        subtitle="price · density · stock"
        action={{ label: 'Inventory', onClick: () => onNavigate('/inventory') }}
      />
      <FuelsCard />
    </>
  );
};
