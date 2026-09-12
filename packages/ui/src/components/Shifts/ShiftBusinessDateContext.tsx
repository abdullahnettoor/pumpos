import React from 'react';
import { CalendarRange, Clock3, Info } from 'lucide-react';
import { formatStationDateTime, historicalShiftMessage } from '@pump/shared';
import { formatDate } from '../../utils/format.js';

export interface ShiftBusinessDateContextProps {
  businessDate: string;
  currentBusinessDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  timeZone?: string;
  compact?: boolean;
}

export const ShiftBusinessDateContext: React.FC<ShiftBusinessDateContextProps> = ({
  businessDate,
  currentBusinessDate,
  scheduledStartTime,
  scheduledEndTime,
  openedAt,
  closedAt,
  timeZone,
  compact = false,
}) => {
  const historicalMessage = historicalShiftMessage(businessDate, currentBusinessDate);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '5px' : '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12px' }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-strong)' }}>
          <CalendarRange size={14} /> Shift Business Date · {formatDate(businessDate)}
        </strong>
        {scheduledStartTime && scheduledEndTime && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)' }}>
            <Clock3 size={13} /> Scheduled Shift Window · {scheduledStartTime}–{scheduledEndTime}
          </span>
        )}
        {openedAt && <span style={{ color: 'var(--text-faint)' }}>Shift Opened At · {formatStationDateTime(openedAt, timeZone)}</span>}
        {closedAt && <span style={{ color: 'var(--text-faint)' }}>Shift Closed At · {formatStationDateTime(closedAt, timeZone)}</span>}
      </div>
      {historicalMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: compact ? '6px 9px' : '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', background: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', fontSize: '12px' }}>
          <Info size={13} style={{ flexShrink: 0 }} />
          <span>{historicalMessage}</span>
        </div>
      )}
    </div>
  );
};
