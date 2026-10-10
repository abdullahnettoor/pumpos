import React from 'react';
import type { TankMovementRow } from '../../lib/reports/dssr.js';
import { ListGroup, ListRow, TONE_TEXT } from '../../ui/index.js';

/** Fuel stock per tank at close: book against the dip, with the variance in litres. */
export const StockMovement: React.FC<{ tanks: readonly TankMovementRow[] }> = ({ tanks }) => (
  <ListGroup>
    {tanks.map((t) => (
      <ListRow
        key={t.key}
        title={t.title}
        meta={
          <span className="num">
            <span className="block">{t.movement}</span>
            {t.sold && <span className="block">{t.sold}</span>}
          </span>
        }
        end={
          <div>
            <div className="text-[10px] font-medium text-text-muted">Variance</div>
            <div className={`num ${TONE_TEXT[t.tone]}`}>{t.variance}</div>
          </div>
        }
      />
    ))}
  </ListGroup>
);
