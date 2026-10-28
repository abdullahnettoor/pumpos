import React from 'react';
import { rupees } from '../../lib/format.js';
import type { DssrShiftRow } from '../../lib/reports/dssr.js';
import { ListGroup, ListRow, StatusBadge } from '../../ui/index.js';

interface Props {
  shifts: readonly DssrShiftRow[];
  onOpen: (shiftId: string) => void;
}

/** The Shifts the DSSR is built from; each row opens that Shift's own Summary. */
export const IncludedShifts: React.FC<Props> = ({ shifts, onOpen }) => (
  <ListGroup>
    {shifts.map((s) => (
      <ListRow
        key={s.shiftId}
        leading={
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] bg-track text-[11px] font-bold text-text-high">
            {s.chip}
          </span>
        }
        title={s.title}
        meta={<span className="num">{s.meta}</span>}
        end={
          <div>
            {s.fuelValue !== null && <div className="num">{rupees(s.fuelValue)}</div>}
            <div className="mt-[3px]">
              <StatusBadge tone={s.badge.tone} num>
                {s.badge.text}
              </StatusBadge>
            </div>
          </div>
        }
        onPress={() => onOpen(s.shiftId)}
      />
    ))}
  </ListGroup>
);
