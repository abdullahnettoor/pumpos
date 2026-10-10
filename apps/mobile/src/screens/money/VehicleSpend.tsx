import React from 'react';
import type { CustomerVehicleSpend } from '@pump/shared';
import { compactRupees, plural } from '../../lib/format.js';
import { vehicleBars } from '../../lib/money/receivables.js';
import { SectionLabel } from '../../ui/SectionLabel.js';

/**
 * Vehicles · this month: spend per Vehicle on credit, with a bar sized against
 * the biggest. Not rendered at all when no credit sale this month is linked to a
 * Vehicle (a customer without vehicles gets no empty section).
 */
export const VehicleSpend: React.FC<{ vehicles: readonly CustomerVehicleSpend[] }> = ({
  vehicles,
}) => {
  if (vehicles.length === 0) return null;
  const bars = vehicleBars(vehicles);
  return (
    <section aria-label="Vehicles this month">
      <SectionLabel right={<span>{plural(vehicles.length, 'vehicle')}</span>}>
        Vehicles · this month
      </SectionLabel>
      <ul className="mx-3 list-none overflow-hidden rounded-[14px] border border-line bg-card [&>li+li]:border-t [&>li+li]:border-line">
        {bars.map((v) => (
          <li key={v.vehicleId} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-line bg-card-alt px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                {v.type}
              </span>
              <span className="num min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-high">
                {v.registration}
              </span>
              <span className="num text-[13px] font-semibold text-text-high">
                {compactRupees(v.amount)}
              </span>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track">
              <div
                className="h-full rounded-full bg-warn"
                style={{ width: `${v.pct}%` }}
                data-testid="vehicle-bar"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
