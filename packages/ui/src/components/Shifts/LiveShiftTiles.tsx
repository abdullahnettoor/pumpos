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
import type { LiveShiftFigures } from './liveShiftModel.js';

export interface LiveShiftTilesProps {
  figures: LiveShiftFigures;
  /** The Product Sale lists the Sales tile reads besides the shift status. */
  productQueries: SectionQuery[];
}

const whole = (v: number) => formatMoney(v, { decimals: 0 });

/**
 * Live shift's four tiles (#533), all "This shift": Fuel sold, Sales (fuel +
 * products), Card / UPI / Credit, and Drawer variance. Plain figures; only the
 * variance takes colour, through `alert`, and only when it is not balanced.
 * Everyone sees the variance (owner decision, 15 Oct).
 */
export const LiveShiftTiles: React.FC<LiveShiftTilesProps> = ({ figures, productQueries }) => {
  const { fuel, drawers, takings, products, pending } = figures;
  const fuelValue =
    fuel.byUnit.length === 0
      ? formatQuantity(0, 'L')
      : fuel.byUnit.map((u) => formatQuantity(u.litres, u.unit)).join(' · ');
  const fuelHint = [
    pending.length > 0 ? `${pending.map((g) => g.du).join(', ')} not in yet` : null,
    ...fuel.byProduct.map(
      (p) => `${p.product} ${formatQuantity(p.litres, p.unit, { decimals: 0 })}`,
    ),
  ]
    .filter(Boolean)
    .join(' · ');

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
    <KpiStrip columns="auto">
      <KpiTile
        label="Fuel sold"
        scope="this-shift"
        value={fuelValue}
        hint={fuelHint || 'No closing readings yet'}
      />
      <TileSection title="product sales" query={productQueries}>
        <KpiTile
          label="Sales"
          scope="this-shift"
          value={formatMoney(figures.sales)}
          hint={`Fuel ${whole(fuel.value)} · Products ${whole(products.total)}`}
        />
      </TileSection>
      <KpiTile
        label="Card / UPI / Credit"
        scope="this-shift"
        value={formatMoney(takings.nonCash)}
        hint={`Card ${whole(takings.card)} · UPI ${whole(takings.upi)} · Credit ${whole(takings.credit)}`}
      />
      <KpiTile
        label="Drawer variance"
        scope="this-shift"
        value={
          drawers.recorded === 0 ? '—' : signedMoneyParts(drawers.variance, { plus: true }).text
        }
        alert={alert}
        hint={varianceHint}
      />
    </KpiStrip>
  );
};
