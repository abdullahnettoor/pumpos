import React, { useMemo, useState } from 'react';
import type { Station } from '@pump/shared';
import {
  Button,
  Chip,
  DataSection,
  EmptyState,
  FilterChips,
  Panel,
  SectionHeader,
  StatusChip,
  type FilterChipOption,
} from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import {
  useAccess,
  useDispensers,
  useShiftStatus,
  useStations,
  useTanks,
} from '../../query/hooks.js';
import { countOf } from '../../utils/ledgerWindow.js';
import {
  buildStationRows,
  filterStations,
  stationCounts,
  stationFacts,
  stationPlanLine,
  type StationFilter,
  type StationRow,
} from './organizationModel.js';

export interface StationsTabProps {
  stations: Station[];
  selectedStation: Station | null;
  /** A switch is offered only when more than one station can be reached. */
  canSwitchStation: boolean;
  onStationChange: (station: Station) => void;
  /** The getting-started prompt's onboarding link (the page actions carry the same). */
  onOnboard: () => void;
  /** The same gate as the page action (`onboardGate`). */
  onboardGate: { disabled: boolean; title?: string };
  /** Opens Station for this station, switching to it first when it is not the current one. */
  onConfigure: (station: Station) => void;
  onInviteTeam: () => void;
}

const stationsWord = (n: number) => countOf(n, 'station', 'stations');

/**
 * One station as a card (#605): name and code, address, status, "Current
 * station", its key facts and the Configure / Switch actions. The facts come
 * from the cached setup lists and the lite shift status of that station (no
 * new endpoint); they load and fail on their own, inside the card.
 */
const StationCard: React.FC<{
  row: StationRow;
  canSwitch: boolean;
  onSwitch: () => void;
  onConfigure: () => void;
}> = ({ row, canSwitch, onSwitch, onConfigure }) => {
  const { station, state, active } = row;
  const tanksQ = useTanks(station.id);
  const dispensersQ = useDispensers(station.id);
  const statusQ = useShiftStatus(station.id, { lite: true });
  const facts = stationFacts({
    settings: station.settings,
    tanks: tanksQ.data,
    dispensers: dispensersQ.data,
    openShift: statusQ.data ? (statusQ.data.shift ?? null) : undefined,
  });
  return (
    <Panel role="region" aria-label={station.name} data-testid="station-card">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 break-words text-[14px] font-semibold text-ink-strong">
                {station.name}
              </span>
              {station.code && (
                <span className="shrink-0 font-mono text-[12px] text-ink-faint">
                  {station.code}
                </span>
              )}
            </span>
            <span
              className={cn('text-[12px]', station.address ? 'text-ink-muted' : 'text-ink-faint')}
            >
              {station.address || 'No address'}
            </span>
          </div>
          <StatusChip status={state} className="shrink-0" />
        </div>
        <DataSection
          title="station details"
          shape="bare"
          placeholderHeight={72}
          query={[tanksQ, dispensersQ, statusQ]}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
            {facts.map((f) => (
              <div
                key={f.label}
                className={f.label === 'Open shift' ? 'col-span-2 flex flex-col' : 'flex flex-col'}
              >
                <dt className="text-ink-muted">{f.label}</dt>
                <dd className="truncate text-[13px] text-ink-default">{f.value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </DataSection>
        <div className="mt-auto flex items-center gap-2 border-t border-border-soft pt-3">
          {active && (
            <Chip tone="neutral" size="md">
              Current station
            </Chip>
          )}
          <span className="flex-1" />
          {!active && canSwitch && (
            <Button variant="secondary" size="xs" onClick={onSwitch}>
              Switch
            </Button>
          )}
          <Button
            variant="secondary"
            size="xs"
            onClick={onConfigure}
            aria-label={`Configure ${station.name}`}
          >
            Configure
          </Button>
        </div>
      </div>
    </Panel>
  );
};

/**
 * Organization › Stations (#538, cards #605): stations as cards, three per
 * row. No KPI tiles (owner, 15 Oct): plan usage is one line in the Stations
 * header, only when the plan allows more than one station. The status filter
 * sits in the same header. Until a station is operational a getting-started
 * prompt leads the tab. The list waits on the stations cache, and each card
 * on its own station's facts, so a failed load shows Retry where it failed
 * and never a false "No stations yet".
 */
export const StationsTab: React.FC<StationsTabProps> = ({
  stations,
  selectedStation,
  canSwitchStation,
  onStationChange,
  onOnboard,
  onboardGate,
  onConfigure,
  onInviteTeam,
}) => {
  const [filter, setFilter] = useState<StationFilter>('all');
  // Only Owners and Managers receive the plan; the API enforces the Limit
  // whatever is rendered here.
  const { data: access } = useAccess();
  const planLine = stationPlanLine(access);
  // The list arrives as a prop from the same stations cache; the query is
  // read here for its loading and error state.
  const stationsQ = useStations();

  const all = useMemo(
    () => buildStationRows(stations, selectedStation?.id),
    [stations, selectedStation?.id],
  );
  const counts = stationCounts(all);
  const rows = useMemo(() => filterStations(all, filter), [all, filter]);
  const welcome = counts.ready === 0;

  const options: FilterChipOption<StationFilter>[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'ready', label: 'Ready', count: counts.ready },
    { value: 'setup', label: 'In setup', count: counts.setup },
  ];
  const station = (id: string) => stations.find((s) => s.id === id);

  return (
    <div className="flex flex-col gap-4">
      {/* Getting started: shown until the first station is operational. */}
      {welcome && (
        <section
          aria-label="Getting started"
          className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface-alt p-5"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-ink-strong">
              {stations.length === 0 ? 'Welcome to PumpOS' : 'Finish setting up your station'}
            </h2>
            <p className="text-[13px] leading-normal text-ink-muted">
              Get your station operational to unlock shifts, sales and reports. It takes a few
              minutes and can be done here on desktop.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ConceptIcon concept="stations" />}
              disabled={onboardGate.disabled}
              title={onboardGate.title}
              onClick={onOnboard}
            >
              Onboard station
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ConceptIcon concept="team" />}
              onClick={onInviteTeam}
            >
              Invite your team
            </Button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Stations"
          subtitle={
            filter !== 'all'
              ? `${rows.length} of ${all.length}`
              : (planLine ?? stationsWord(all.length))
          }
          controls={{
            filters: all.length > 1 && (
              <FilterChips
                aria-label="Show stations"
                options={options}
                value={filter}
                onChange={setFilter}
              />
            ),
          }}
        />
        <DataSection
          title="stations"
          query={stationsQ}
          placeholderHeight={200}
          shape="cards"
          isEmpty={rows.length === 0}
          empty={
            <EmptyState
              compact
              icon={<ConceptIcon concept="stations" />}
              title={all.length === 0 ? 'No stations yet' : 'No matching stations'}
              description={
                all.length === 0
                  ? 'Onboard your first station to start running shifts.'
                  : 'Choose another filter.'
              }
            />
          }
        >
          <ul
            aria-label="Stations"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {rows.map((row) => (
              <li key={row.station.id} className="flex flex-col [&>*]:flex-1">
                <StationCard
                  row={row}
                  canSwitch={canSwitchStation}
                  onSwitch={() => {
                    const s = station(row.station.id);
                    if (s) onStationChange(s);
                  }}
                  onConfigure={() => {
                    const s = station(row.station.id);
                    if (s) onConfigure(s);
                  }}
                />
              </li>
            ))}
          </ul>
        </DataSection>
      </section>
    </div>
  );
};
