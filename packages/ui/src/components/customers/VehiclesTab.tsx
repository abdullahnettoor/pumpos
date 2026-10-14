import React, { useMemo, useState } from 'react';
import {
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  type SectionQuery,
} from '../../pump-ds/index.js';
import { buildVehicleColumns, type VehicleRow } from './columns.js';
import { countOf } from './ledgerWindow.js';

export interface VehiclesTabProps {
  vehiclesQ: SectionQuery & { data?: VehicleRow[] };
  onEdit: (v: VehicleRow) => void;
  onDelete: (v: VehicleRow) => void;
}

const vehicles = (n: number) => countOf(n, 'vehicle', 'vehicles');

/** Customers › Vehicles: the registered vehicles, searchable from the section header. */
export const VehiclesTab: React.FC<VehiclesTabProps> = ({ vehiclesQ, onEdit, onDelete }) => {
  const [search, setSearch] = useState('');
  const all = useMemo(() => vehiclesQ.data ?? [], [vehiclesQ.data]);
  const columns = useMemo(() => buildVehicleColumns(onEdit, onDelete), [onEdit, onDelete]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((v) =>
      [v.registrationNumber, v.customerName, v.vehicleType].some((s) =>
        (s ?? '').toLowerCase().includes(q),
      ),
    );
  }, [all, search]);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Vehicles"
        subtitle={
          vehiclesQ.data
            ? search.trim()
              ? `${rows.length} of ${all.length}`
              : vehicles(all.length)
            : undefined
        }
        controls={{
          search: (
            <div className="w-[240px]">
              <SearchInput
                inputSize="sm"
                value={search}
                onChange={setSearch}
                placeholder="Search registration / customer…"
              />
            </div>
          ),
        }}
      />
      <DataSection
        title="vehicles"
        query={vehiclesQ}
        placeholderHeight={240}
        flush
        isEmpty={rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="truck" size="md" />}
              title={all.length === 0 ? 'No vehicles' : 'No matching vehicles'}
              description={
                all.length === 0
                  ? 'Register a vehicle against a Credit or Fleet customer to see it here.'
                  : 'Try a different search term.'
              }
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          title="vehicles"
        />
      </DataSection>
    </section>
  );
};
