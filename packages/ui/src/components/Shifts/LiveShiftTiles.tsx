import React from 'react';
import { variancePresentation } from '@pump/shared';
import {
  KpiStrip,
  KpiTile,
  TileSection,
  type KpiAlert,
  type SectionQuery,
} from '../../pump-ds/index.js';
import { formatMoney, formatQuantity, signedMoneyParts } from '../../utils/format.js';
import { pendingNote, type LiveShiftFigures } from './liveShiftModel.js';

export interface LiveShiftTilesProps {
  figures: LiveShiftFigures;
  /** The Product Sale lists the Sales tile reads besides the shift status. */
  productQueries: SectionQuery[];
}

const whole = (v: number) => formatMoney(v, { decimals: 0 });

/**
 * Live shift's three tiles (#533), all "This shift": Sales (fuel + products),
 * Card / UPI / Credit, and Drawer variance. No Fuel sold tile: its litres are
 * the nozzle table's total (#515), so they sit in the Sales hint. Plain figures; only the
 * variance takes colour, through `alert`, and only when it is not balanced.
 * Everyone sees the variance (owner decision, 15 Oct).
 */
export const LiveShiftTiles: React.FC<LiveShiftTilesProps> = ({ figures, productQueries }) => {
  const { fuel, drawers, takings, products, pending } = figures;
  // Litres are the nozzle table's total, so they ride in the Sales hint, not a tile of their own.
  const litres = fuel.byUnit
    .map((u) => formatQuantity(u.litres, u.unit, { decimals: 0 }))
    .join(' · ');
  // Same rows as the nozzle total, and the same words for what is left out.
  const note = pendingNote(pending);
  // The exclusion leads, so a narrow tile truncates the breakdown, never it.
  const salesHint = note
    ? `${note[0].toUpperCase()}${note.slice(1)} · Fuel ${whole(fuel.value)} · Products ${whole(products.total)}`
    : `Fuel ${whole(fuel.value)}${litres ? ` (${litres})` : ''} · Products ${whole(products.total)}`;

  const v = variancePresentation(drawers.variance, 'cash');
  const alert: KpiAlert | undefined =
    drawers.recorded === 0 || v.state === 'balanced'
      ? undefined
      : v.state === 'short'
        ? 'danger'
        : 'warning';
  const varianceHint =
    drawers.recorded === 0
      ? 'No handovers yet'
      : [
          drawers.short > 0 ? `${drawers.short} short` : null,
          drawers.surplus > 0 ? `${drawers.surplus} surplus` : null,
          drawers.balanced > 0 ? `${drawers.balanced} balanced` : null,
          pending.length > 0 ? `${pending.length} pending` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <KpiStrip columns="auto" scope="this-shift">
      <TileSection title="product sales" query={productQueries}>
        <KpiTile
          label="Sales"
          value={formatMoney(figures.sales)}
          hint={salesHint}
          title={salesHint}
        />
      </TileSection>
      <KpiTile
        label="Card / UPI / Credit"
        value={formatMoney(takings.nonCash)}
        hint={`Card ${whole(takings.card)} · UPI ${whole(takings.upi)} · Credit ${whole(takings.credit)}`}
      />
      <KpiTile
        label="Drawer variance"
        value={
          drawers.recorded === 0 ? '—' : signedMoneyParts(drawers.variance, { plus: true }).text
        }
        alert={alert}
        hint={varianceHint}
      />
    </KpiStrip>
  );
};
