import React from 'react';
import { rupees } from '../../lib/format.js';
import type { ShiftHistoryDay, ShiftHistoryRow } from '../../lib/shifts/history.js';
import { ListGroup, ListRow, SectionLabel, StatusBadge } from '../../ui/index.js';

interface Props {
  days: readonly ShiftHistoryDay[];
  onOpen: (row: ShiftHistoryRow) => void;
}

/** Closed Shifts by Shift Business Date: one card per day with the day's total in its label. */
export const ShiftHistory: React.FC<Props> = ({ days, onOpen }) => (
  <>
    {days.map((day) => (
      <section key={day.businessDate} aria-label={day.label}>
        <SectionLabel right={<span className="num">{rupees(day.total)}</span>}>
          {day.label}
        </SectionLabel>
        <ListGroup>
          {day.rows.map((row) => (
            <ListRow
              key={row.shiftId}
              title={row.title}
              meta={<span className="num">{row.window}</span>}
              end={
                <div>
                  <div className="num">{rupees(row.sales)}</div>
                  <div className="mt-[3px]">
                    <StatusBadge tone={row.badge.tone} num>
                      {row.badge.text}
                    </StatusBadge>
                  </div>
                </div>
              }
              onPress={() => onOpen(row)}
            />
          ))}
        </ListGroup>
      </section>
    ))}
  </>
);
