import React from 'react';
import { ATTENDANT_REPORT_CAPABILITY, type InsightsRangeDays } from '@pump/shared';
import { CapabilityGate, useInsightsAttendantVariance } from '@pump/ui';
import { signedRupees } from '../../lib/format.js';
import { attendantNote, attendantTone, divergeBars } from '../../lib/insights/blocks.js';
import { Avatar, ListGroup, TONE_TEXT } from '../../ui/index.js';
import { BlockFrame } from './BlockFrame.js';

const Block: React.FC<{ stationId: string; days: InsightsRangeDays }> = ({ stationId, days }) => {
  const q = useInsightsAttendantVariance(stationId, days);
  const rows = q.data ?? [];
  const bars = divergeBars(rows);

  return (
    <BlockFrame
      title="Cash variance by attendant"
      right={`${days} days`}
      isError={q.isError}
      loaded={!!q.data}
      onRetry={() => void q.refetch()}
      empty={
        q.data && rows.length === 0
          ? 'No closed Shift has attendant variances in this range.'
          : undefined
      }
    >
      <ListGroup>
        {rows.map((a, i) => {
          const tone = attendantTone(a.netVariance);
          const short = a.netVariance < 0;
          return (
            <div
              key={a.attendantId}
              className="grid grid-cols-[30px_minmax(0,1fr)_92px_64px] items-center gap-2.5 px-3 py-2.5"
            >
              <Avatar name={a.name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-text-high">{a.name}</p>
                <p className="truncate text-[11px] text-text-muted">{attendantNote(a)}</p>
              </div>
              {/* Decorative: the signed net beside it says the same in words and figures. */}
              <div aria-hidden="true" className="relative h-2 rounded-full bg-track">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                <i
                  className={`absolute inset-y-0 rounded-full ${short ? 'bg-bad' : 'bg-warn'}`}
                  style={
                    short
                      ? { right: '50%', width: `${bars[i] * 50}%` }
                      : { left: '50%', width: `${bars[i] * 50}%` }
                  }
                />
              </div>
              <span className={`num text-right text-[13px] font-semibold ${TONE_TEXT[tone]}`}>
                {signedRupees(a.netVariance, { plus: true })}
              </span>
            </div>
          );
        })}
      </ListGroup>
    </BlockFrame>
  );
};

/**
 * Gated on the `reports.attendant` Product Capability, like the Attendant
 * Handover Report: hidden (and never fetched) unless the Organization has it.
 * The server refuses the read the same way, so this is presentation, not the guard.
 */
export const AttendantVariance: React.FC<{ stationId: string; days: InsightsRangeDays }> = (
  props,
) => (
  <CapabilityGate capability={ATTENDANT_REPORT_CAPABILITY} upgrade={null}>
    <Block {...props} />
  </CapabilityGate>
);
