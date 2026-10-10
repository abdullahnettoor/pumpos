import React from 'react';
import { isBalancedVariance } from '@pump/shared';
import { rupees } from '../../lib/home/format.js';
import type { DrawerLine, OfficeCount } from '../../lib/shifts/summary.js';
import { varianceBadge } from '../../lib/shifts/variance.js';
import { ListGroup, StatusBadge } from '../../ui/index.js';

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    aria-hidden="true"
    className="grid h-8 min-w-8 max-w-[64px] flex-shrink-0 place-items-center truncate rounded-[9px] border border-line bg-card-alt px-1.5 text-[11px] font-bold text-text-muted"
  >
    {children}
  </span>
);

/** "Declared ₹34,420" when it matches, "₹31,460 of ₹31,800" when it does not. */
function declaredLabel(d: DrawerLine): string {
  if (d.declared === null) return 'Not handed over';
  if (d.variance !== null && isBalancedVariance(d.variance))
    return `Declared ${rupees(d.declared)}`;
  return `${rupees(d.declared)} of ${rupees(d.expected ?? 0)}`;
}

const DrawerRow: React.FC<{ d: DrawerLine }> = ({ d }) => (
  <div className="flex items-center gap-2.5 px-3 py-[11px]">
    <Chip>{d.du}</Chip>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-semibold text-text-high">{d.attendant}</p>
      <p className="num truncate text-[11px] text-text-muted">{declaredLabel(d)}</p>
    </div>
    {d.variance === null ? (
      <StatusBadge tone="warn">Pending</StatusBadge>
    ) : (
      <StatusBadge tone={varianceBadge(d.variance).tone} num>
        {varianceBadge(d.variance).text}
      </StatusBadge>
    )}
  </div>
);

/**
 * Per attendant: what they declared against what their Drawer should hold, with
 * the server's variance. Below it, the office count: the cash counted at close
 * against what the Drawers declared (ADR 0005: two levels, never added together).
 */
export const DrawerReconciliation: React.FC<{
  drawers: readonly DrawerLine[];
  office: OfficeCount;
}> = ({ drawers, office }) => {
  const badge = varianceBadge(office.variance);
  return (
    <ListGroup>
      {drawers.map((d) => (
        <DrawerRow key={d.key} d={d} />
      ))}
      <div className="flex items-center gap-2.5 bg-card-alt px-3 py-[11px]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text-high">{office.label}</p>
          <p className="num truncate text-[11px] text-text-muted">
            Counted {rupees(office.counted)} · expected {rupees(office.expected)}
          </p>
        </div>
        <StatusBadge tone={badge.tone} num>
          {isBalancedVariance(office.variance) ? 'Matched' : badge.text}
        </StatusBadge>
      </div>
    </ListGroup>
  );
};
