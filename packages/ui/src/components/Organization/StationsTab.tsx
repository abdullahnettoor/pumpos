import React, { useMemo, useState } from 'react';
import type { Station } from '@pump/shared';
import {
  Button,
  Chip,
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  StatusChip,
  type FilterChipOption,
  type TableColumn,
} from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { useAccess } from '../../query/hooks.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { TileSection } from '../customers/TileSection.js';
import { stationLimitMessage } from '@pump/shared';
import {
  buildStationRows,
  filterStations,
  stationCapacity,
  stationCounts,
  type StationFilter,
  type StationRow,
} from './organizationModel.js';

export interface StationsTabProps {
  stations: Station[];
  selectedStation: Station | null;
  /** A switch is offered only when more than one station can be reached. */
  canSwitchStation: boolean;
  onStationChange: (station: Station) => void;
  onOnboard: () => void;
  onConfigure: () => void;
  onInviteTeam: () => void;
}

const stationsWord = (n: number) => countOf(n, 'station', 'stations');

const buildColumns = (
  canSwitch: boolean,
  onSwitch: (stationId: string) => void,
  onConfigure: () => void,
): TableColumn<StationRow>[] => [
  {
    id: 'name',
    header: 'Station',
    kind: 'text',
    value: (r) => r.station.name,
    width: '46%',
    cell: (r) => (
      <span className="inline-flex min-w-0 flex-col items-start leading-tight">
        <span className="inline-flex items-center gap-2 font-medium text-ink-strong">
          {r.station.name}
          {r.station.code && (
            <span className="font-mono text-[12px] text-ink-faint">{r.station.code}</span>
          )}
        </span>
        {r.details && (
          <span className="mt-0.5 truncate text-[12px] text-ink-muted">{r.details}</span>
        )}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'status',
    value: (r) => r.state,
    width: '22%',
  },
  {
    id: 'actions',
    header: '',
    kind: 'text',
    value: () => null,
    cell: (r) => (
      <span className="flex items-center justify-end gap-2">
        {r.active ? (
          <>
            <Chip tone="neutral" size="xs">
              Current station
            </Chip>
            <Button variant="secondary" size="xs" onClick={onConfigure}>
              Configure
            </Button>
          </>
        ) : canSwitch ? (
          <Button variant="secondary" size="xs" onClick={() => onSwitch(r.station.id)}>
            Set active
          </Button>
        ) : null}
      </span>
    ),
  },
];

/**
 * Organization › Stations (#538): a list, layout B. Station usage against the
 * plan's Limit (Access Document) and how many are ready sit on top; the status
 * filter sits in the list's header. Until a station is operational a
 * getting-started prompt leads the tab.
 */
export const StationsTab: React.FC<StationsTabProps> = ({
  stations,
  selectedStation,
  canSwitchStation,
  onStationChange,
  onOnboard,
  onConfigure,
  onInviteTeam,
}) => {
  const [filter, setFilter] = useState<StationFilter>('all');
  // Station capacity comes from the Access Document. Only Owners and Managers
  // receive the plan key, so that is the signal for showing it at all. The API
  // enforces the Limit regardless of what is rendered here.
  const accessQ = useAccess();
  const capacity = stationCapacity(accessQ.data);
  const capacityMessage = capacity?.reached ? stationLimitMessage(capacity.value) : undefined;

  const all = useMemo(
    () => buildStationRows(stations, selectedStation?.id),
    [stations, selectedStation?.id],
  );
  const counts = stationCounts(all);
  const rows = useMemo(() => filterStations(all, filter), [all, filter]);
  const columns = useMemo(
    () =>
      buildColumns(
        canSwitchStation,
        (id) => {
          const station = stations.find((s) => s.id === id);
          if (station) onStationChange(station);
        },
        onConfigure,
      ),
    [canSwitchStation, stations, onStationChange, onConfigure],
  );
  const welcome = counts.ready === 0;

  const options: FilterChipOption<StationFilter>[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'ready', label: 'Ready', count: counts.ready },
    { value: 'setup', label: 'In setup', count: counts.setup },
  ];

  const onboardButton = (primary: boolean) => (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      size="sm"
      leftIcon={primary ? <ConceptIcon concept="stations" /> : <Icon name="plus" size="sm" />}
      disabled={capacity?.reached === true}
      title={capacityMessage}
      onClick={onOnboard}
    >
      Onboard station
    </Button>
  );

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
            {onboardButton(true)}
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

      {(capacity || stations.length > 0) && (
        <KpiStrip columns="auto">
          {capacity && (
            <TileSection title="station usage" query={accessQ}>
              <KpiTile
                label="Stations on plan"
                scope="now"
                alert={capacity.reached ? 'warning' : undefined}
                value={`${capacity.used} of ${capacity.value}`}
                hint={capacity.hint}
              />
            </TileSection>
          )}
          {stations.length > 0 && (
            <KpiTile
              label="Ready for operations"
              scope="now"
              value={`${counts.ready} of ${counts.all}`}
              hint={
                counts.setup > 0
                  ? `${stationsWord(counts.setup)} still in setup`
                  : 'All operational'
              }
            />
          )}
        </KpiStrip>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Stations"
          subtitle={filter !== 'all' ? `${rows.length} of ${all.length}` : stationsWord(all.length)}
          controls={{
            filters: all.length > 1 && (
              <FilterChips
                aria-label="Show stations"
                options={options}
                value={filter}
                onChange={setFilter}
              />
            ),
            actions: (
              <>
                {capacityMessage && (
                  <span className="text-[12px] text-ink-muted">{capacityMessage}</span>
                )}
                {onboardButton(!welcome)}
              </>
            ),
          }}
        />
        <DataSection
          title="stations"
          placeholderHeight={160}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
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
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={columns}
            rows={rows}
            rowKey={(r) => r.station.id}
            title="stations"
          />
        </DataSection>
      </section>
    </div>
  );
};
