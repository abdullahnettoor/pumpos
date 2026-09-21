/**
 * The home screen: every organization in one table, each row a drawer.
 *
 * This is the whole navigation model. `owners list` already returns the id,
 * name, owner and station counts, and `organization access show` fills the
 * rest — so a single table plus a drawer covers every CLI command while
 * removing its worst ergonomic problem: pasting organization UUIDs.
 */
import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Banner, Button, Checkbox, DataTable, PageLayout, TextInput } from '@pump/ui';
import { useOwners } from '../api/queries.js';
import type { ApiTarget } from '../api/targets.js';
import type { OwnerRow } from '../api/types.js';
import { OrganizationDrawer } from '../components/OrganizationDrawer.js';
import { InviteOwnerDrawer } from '../components/InviteOwnerDrawer.js';

export interface OrganizationsScreenProps {
  target: ApiTarget;
}

const STATUS_TONE: Record<string, string> = {
  active: 'var(--state-success-fg)',
  invited: 'var(--state-info-fg)',
  deactivated: 'var(--state-danger-fg)',
  unlinked: 'var(--state-warning-fg)',
};

export const OrganizationsScreen: React.FC<OrganizationsScreenProps> = ({ target }) => {
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const owners = useOwners(target, includeRevoked, true);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return owners.data;
    return owners.data?.filter(
      (row) =>
        row.organizationName.toLowerCase().includes(term) ||
        (row.owner?.email ?? '').toLowerCase().includes(term) ||
        row.organizationId.startsWith(term),
    );
  }, [owners.data, search]);

  // The selected row is read back out of the list so it follows an
  // invalidation; holding the row object would freeze it at click time.
  const selected = owners.data?.find((row) => row.organizationId === selectedId) ?? null;

  const columns = useMemo<ColumnDef<OwnerRow, unknown>[]>(
    () => [
      {
        header: 'Organization',
        accessorKey: 'organizationName',
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 500 }}>{row.original.organizationName}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {row.original.owner?.email ?? 'no owner'}
            </div>
          </div>
        ),
      },
      {
        header: 'Owner',
        id: 'ownerStatus',
        accessorFn: (row) => row.owner?.status ?? 'no-owner',
        cell: ({ getValue }) => {
          const status = String(getValue());
          return (
            <span style={{ color: STATUS_TONE[status] ?? 'var(--text-muted)' }}>{status}</span>
          );
        },
      },
      {
        header: 'Plan',
        accessorFn: (row) => row.subscriptionPlan ?? '—',
      },
      {
        header: 'Subscription',
        accessorFn: (row) => row.subscriptionStatus ?? '—',
      },
      {
        header: 'Stations',
        id: 'stations',
        accessorFn: (row) => row.stationCount,
        cell: ({ row }) => `${row.original.readyStationCount} / ${row.original.stationCount}`,
      },
    ],
    [],
  );

  return (
    <>
      <PageLayout
        title="Organizations"
        subtitle={`Platform back-office — ${target.label}`}
        actions={<Button onClick={() => setInviting(true)}>Invite owner</Button>}
        toolbar={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, owner email or id"
              style={{ width: 320 }}
            />
            <Checkbox
              checked={includeRevoked}
              onChange={(e) => setIncludeRevoked(e.target.checked)}
              label="Include revoked"
            />
          </div>
        }
      >
        {owners.error && (
          <Banner severity="danger" title="Could not load organizations">
            {owners.error.message}
          </Banner>
        )}
        <DataTable
          columns={columns}
          data={rows}
          isLoading={owners.isLoading}
          emptyMessage="No organizations match."
          getRowId={(row) => row.organizationId}
          highlightRowId={selectedId}
          onRowClick={(row) => setSelectedId(row.organizationId)}
        />
      </PageLayout>

      <OrganizationDrawer target={target} row={selected} onClose={() => setSelectedId(null)} />
      {inviting && <InviteOwnerDrawer target={target} onClose={() => setInviting(false)} />}
    </>
  );
};
