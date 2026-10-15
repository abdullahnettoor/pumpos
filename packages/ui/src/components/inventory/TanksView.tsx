import React, { useMemo, useState } from 'react';
import { DAYS_OF_COVER_WINDOW, type TankLevelSettings } from '@pump/shared';
import {
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  SectionHeader,
  TankGauge,
  type FilterChipOption,
} from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { OVER_CAPACITY_EXPLANATION } from '../../utils/stock.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { TankStatusChips } from './TankStatusChips.js';
import {
  TANK_FILTERS,
  tanksStock,
  tankViews,
  type TankFilter,
  type TankRow,
  type TankView,
} from './inventoryFigures.js';
import type { QueryOf } from '../purchases/supplierFigures.js';

export interface TanksViewProps {
  tanksQ: QueryOf<TankRow[]>;
  tankLevels: TankLevelSettings;
  /** Deep link from a stock alert: the tank to bring into view. */
  highlightId: string | null;
}

const tanksCount = (n: number) => countOf(n, 'tank', 'tanks');

const FILTER_LABEL: Record<TankFilter, string> = {
  all: 'All',
  low: 'Low or critical',
  over: 'Over capacity',
  decanting: 'Waiting on decantation',
};

const coverFallback = `cover after ${DAYS_OF_COVER_WINDOW} days of sales`;

const TankCard: React.FC<{ tank: TankView; highlighted: boolean }> = ({ tank, highlighted }) => {
  const { row, level, states } = tank;
  const product = [row.productName, row.productCode].filter(Boolean).join(' · ');
  return (
    <li
      ref={(el) => {
        if (el && highlighted) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
      data-testid={`tank-${row.id}`}
      data-highlighted={highlighted || undefined}
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-surface px-4 py-3.5 transition-shadow',
        highlighted ? 'border-info-fg ring-2 ring-info-bg' : 'border-border-soft',
      )}
    >
      <TankGauge
        name={row.name}
        level={level}
        size="lg"
        unit={row.productUnit}
        coverFallback={coverFallback}
        showStatus={false}
      />
      {(product || states.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-2.5">
          <span className="min-w-0 truncate text-[12px] text-ink-muted">{product}</span>
          <TankStatusChips states={states} className="flex flex-wrap justify-end gap-1" />
        </div>
      )}
    </li>
  );
};

/**
 * Inventory → Tanks: a balance list (layout B, #567). Each tank is the
 * Dashboard's `TankGauge` (tube) at the large size, so a tank reads the same
 * tone, words and stock of capacity on both pages (#520). The status filter
 * sits in the list's own header; a filtered list totals the stock shown.
 */
export const TanksView: React.FC<TanksViewProps> = ({ tanksQ, tankLevels, highlightId }) => {
  const [filter, setFilter] = useState<TankFilter>('all');
  const tanks = useMemo(() => tankViews(tanksQ.data ?? [], tankLevels), [tanksQ.data, tankLevels]);
  const options = useMemo<FilterChipOption<TankFilter>[]>(
    () =>
      (Object.keys(TANK_FILTERS) as TankFilter[]).map((value) => {
        const count = tanks.filter(TANK_FILTERS[value]).length;
        const status =
          value === 'low'
            ? tanks.some((t) => t.level.tone === 'critical')
              ? ('tank-critical' as const)
              : ('tank-low' as const)
            : value === 'over'
              ? ('tank-over-capacity' as const)
              : value === 'decanting'
                ? ('tank-waiting-decantation' as const)
                : undefined;
        return { value, label: FILTER_LABEL[value], count, ...(status ? { status } : {}) };
      }),
    [tanks],
  );
  // A deep-linked tank is never hidden by a filter.
  const rows = useMemo(
    () => tanks.filter((t) => TANK_FILTERS[filter](t) || t.row.id === highlightId),
    [tanks, filter, highlightId],
  );
  const filtered = filter !== 'all';
  const shownStock = filtered ? tanksStock(rows) : null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Tanks"
        subtitle={
          tanksQ.data
            ? filtered
              ? `Total of ${rows.length} shown${shownStock ? ` · ${shownStock}` : ''}`
              : tanksCount(tanks.length)
            : undefined
        }
        controls={{
          filters: tanksQ.data && tanks.length > 0 && (
            <FilterChips
              aria-label="Tank status"
              options={options}
              value={filter}
              onChange={setFilter}
            />
          ),
          info: (
            <InfoTip label="About tank levels" placement="bottom">
              A tank is critical below {tankLevels.criticalBelowPct}% of capacity and low below{' '}
              {tankLevels.lowBelowPct}%, the station&rsquo;s tank levels (Station → Rules), the same
              ones the Dashboard uses. Over capacity: {OVER_CAPACITY_EXPLANATION} Waiting on
              decantation: a tanker is unloaded but not yet measured, so book stock is incomplete.
            </InfoTip>
          ),
        }}
      />
      <DataSection
        title="tanks"
        query={tanksQ}
        shape="cards"
        placeholderHeight={240}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState
            compact
            icon={<Icon name="tank" size="md" />}
            title={tanks.length === 0 ? 'No fuel tanks' : 'No tanks match'}
            description={
              tanks.length === 0
                ? 'Add tanks in Station → Tanks.'
                : 'Every tank is outside this filter.'
            }
          />
        }
      >
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {rows.map((t) => (
            <TankCard key={t.row.id} tank={t} highlighted={t.row.id === highlightId} />
          ))}
        </ul>
      </DataSection>
    </section>
  );
};
