import React from 'react';
import { variancePresentation } from '@pump/shared';
import {
  Button,
  EmptyState,
  Icon,
  KpiStrip,
  KpiTile,
  TileSection,
  type KpiAlert,
  type SectionQuery,
} from '../../pump-ds/index.js';
import { countOf } from '../../utils/ledgerWindow.js';
import {
  formatClockInZone,
  formatMoney,
  formatQuantity,
  signedMoneyParts,
} from '../../utils/format.js';
import type { DayFigures } from './businessDayModel.js';

export interface IdleShiftViewProps {
  /** Today's DSR (preview), for the three "Today" tiles. */
  dayQuery: SectionQuery;
  day: DayFigures;
  lastShift: {
    templateName?: string | null;
    closedAt?: string | null;
    closedByName?: string | null;
  } | null;
  /** The last shift's office count variance, when its summary is loaded. */
  lastVariance: number | null;
  timeZone?: string;
  onViewLastSummary: (() => void) | null;
}

const varianceAlert = (v: number | null): KpiAlert | undefined => {
  if (v == null) return undefined;
  const p = variancePresentation(v, 'cash');
  return p.state === 'short' ? 'danger' : p.state === 'surplus' ? 'warning' : undefined;
};

/**
 * Live shift with no shift open (#533): today so far in three tiles, then
 * what closed last and the way to open the next shift (the page's Open shift
 * button).
 */
export const IdleShiftView: React.FC<IdleShiftViewProps> = ({
  dayQuery,
  day,
  lastShift,
  lastVariance,
  timeZone,
  onViewLastSummary,
}) => {
  const variance = day.attendantVariance ?? day.officeVariance;
  const lastWord =
    lastVariance == null
      ? ''
      : `, ${variancePresentation(lastVariance, 'cash').label.toLowerCase()}`;
  const closed = lastShift?.closedAt
    ? `${lastShift.templateName || 'The last shift'} closed at ${formatClockInZone(
        lastShift.closedAt,
        timeZone,
      )}${lastShift.closedByName ? ` by ${lastShift.closedByName}` : ''}${lastWord}. `
    : '';
  return (
    <div className="flex flex-col gap-4">
      <KpiStrip columns="auto">
        <TileSection title="today's fuel" query={dayQuery}>
          <KpiTile
            label="Fuel sold"
            scope="today"
            value={formatQuantity(day.netVolume, 'L')}
            hint={`${countOf(day.shiftsIncluded, 'shift', 'shifts')} closed`}
          />
        </TileSection>
        <TileSection title="today's sales" query={dayQuery}>
          <KpiTile
            label="Sales"
            scope="today"
            value={formatMoney(day.revenue)}
            hint={`Fuel ${formatMoney(day.revenueFuel, { decimals: 0 })} · Products ${formatMoney(
              day.revenueProducts,
              { decimals: 0 },
            )}`}
          />
        </TileSection>
        <TileSection title="today's drawer variance" query={dayQuery}>
          <KpiTile
            label="Drawer variance"
            scope="today"
            value={variance == null ? '—' : signedMoneyParts(variance, { plus: true }).text}
            alert={varianceAlert(variance)}
            hint={
              variance == null
                ? 'No shift closed today'
                : variancePresentation(variance, 'cash').label
            }
          />
        </TileSection>
      </KpiStrip>
      <div className="rounded-card border border-border-soft bg-surface px-6 py-10">
        <EmptyState
          icon={<Icon name="pump" size="md" />}
          title="No shift open"
          description={
            lastShift
              ? `${closed}Opening readings carry over from its closing.`
              : 'No shift has been opened at this station yet. The first shift takes an opening reading for every nozzle.'
          }
          action={
            onViewLastSummary ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Icon name="file-text" size="xs" />}
                onClick={onViewLastSummary}
              >
                View last shift summary
              </Button>
            ) : undefined
          }
        />
      </div>
    </div>
  );
};
