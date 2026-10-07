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
import { Banner, Button, Checkbox, DataTable, PageLayout, Select, TextInput } from '@pump/ui';
import { useOwners } from '../api/queries.js';
import type { ApiTarget } from '../api/targets.js';
import type { OwnerRow } from '../api/types.js';
import { OrganizationDrawer } from '../components/OrganizationDrawer.js';
import { InviteOwnerDrawer } from '../components/InviteOwnerDrawer.js';
import { CreateDemoDrawer } from '../components/CreateDemoDrawer.js';

export interface OrganizationsScreenProps {
  target: ApiTarget;
}

const STATUS_TONE: Record<string, string> = {
  active: 'var(--state-success-fg)',
  invited: 'var(--state-info-fg)',
  deactivated: 'var(--state-danger-fg)',
  unlinked: 'var(--state-warning-fg)',
};

function expiryLabel(value: string | null): string {
  if (!value) return 'no expiry';
  const remaining = Date.parse(value) - Date.now();
  if (remaining <= 0) return 'expired';
  const hours = Math.floor(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  return days ? `expires in ${days}d ${hours % 24}h` : `expires in ${hours}h`;
}

export const OrganizationsScreen: React.FC<OrganizationsScreenProps> = ({ target }) => {
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [demoFilter, setDemoFilter] = useState('all');

  const owners = useOwners(target, includeRevoked, true);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = owners.data?.filter(
      (row) => demoFilter === 'all' || row.isDemo === (demoFilter === 'demo'),
    );
    if (!term) return filtered;
    return filtered?.filter(
      (row) =>
        row.organizationName.toLowerCase().includes(term) ||
        (row.owner?.email ?? '').toLowerCase().includes(term) ||
        row.organizationId.startsWith(term),
    );
  }, [owners.data, search, demoFilter]);

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
            {row.original.isDemo && (
              <div style={{ color: 'var(--state-warning-fg)', fontSize: '11px' }}>
                Demo · {expiryLabel(row.original.demoExpiresAt)}
              </div>
            )}
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
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {!target.production && (
              <Button variant="secondary" onClick={() => setCreatingDemo(true)}>
                Create demo station
              </Button>
            )}
            <Button onClick={() => setInviting(true)}>Invite owner</Button>
          </div>
        }
        toolbar={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, owner email or id"
              style={{ width: 320 }}
            />
            <Select
              value={demoFilter}
              onChange={(e) => setDemoFilter(e.target.value)}
              aria-label="Filter organization type"
            >
              <option value="all">All organizations</option>
              <option value="demo">Demo</option>
              <option value="real">Real</option>
            </Select>
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
      {creatingDemo && <CreateDemoDrawer target={target} onClose={() => setCreatingDemo(false)} />}
    </>
  );
};
