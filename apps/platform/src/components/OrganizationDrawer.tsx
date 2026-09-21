/**
 * One organization, everything the CLI could do to it.
 *
 * Tabs match the CLI's command groups, so the mapping stays obvious:
 *   Owner        → `owners resend|revoke|deactivate|reactivate`
 *   Capabilities → `organization capability grant|revoke`
 *   Limits       → `organization limit set|clear`
 *   Billing      → `organization plan|subscription|suspend|restore`
 */
import React, { useState } from 'react';
import {
  Banner,
  Drawer,
  Field,
  NumberInput,
  Select,
  Tabs,
  TextInput,
  LoadingSpinner,
} from '@pump/ui';
import { commands, useInvalidatePlatform, useOrganizationAccess } from '../api/queries.js';
import type { ApiTarget } from '../api/targets.js';
import { SUBSCRIPTION_STATUSES, type OrganizationAccess, type OwnerRow } from '../api/types.js';
import { PlatformAction } from './PlatformAction.js';

export interface OrganizationDrawerProps {
  target: ApiTarget;
  row: OwnerRow | null;
  onClose: () => void;
}

/** Reports "no change" honestly instead of claiming an edit that did not happen. */
const changed = (result: { changed?: boolean }, done: string, noop: string) =>
  result?.changed === false ? `No change — ${noop}` : done;

export const OrganizationDrawer: React.FC<OrganizationDrawerProps> = ({ target, row, onClose }) => {
  const [tab, setTab] = useState('owner');
  const access = useOrganizationAccess(target, row?.organizationId ?? null);
  const invalidate = useInvalidatePlatform(target);

  if (!row) return null;
  const orgId = row.organizationId;
  const name = row.organizationName;

  /** Every command refreshes the cache, whether it succeeded or was refused. */
  const run = async <T,>(work: Promise<T>): Promise<T> => {
    try {
      return await work;
    } finally {
      invalidate();
    }
  };

  return (
    <Drawer isOpen onClose={onClose} title={name} widthVariant="wide">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          <code>{orgId}</code>
        </div>

        <Tabs
          variant="underline"
          size="sm"
          activeId={tab}
          onChange={setTab}
          aria-label="Organization administration"
          tabs={[
            { id: 'owner', label: 'Owner' },
            { id: 'capabilities', label: 'Capabilities' },
            { id: 'limits', label: 'Limits' },
            { id: 'billing', label: 'Plan & subscription' },
          ]}
        />

        {tab === 'owner' ? (
          <OwnerTab row={row} onRun={run} target={target} />
        ) : access.isLoading ? (
          <LoadingSpinner />
        ) : access.error ? (
          <Banner severity="danger">{access.error.message}</Banner>
        ) : access.data ? (
          <AccessTabs
            tab={tab}
            name={name}
            orgId={orgId}
            target={target}
            access={access.data}
            onRun={run}
          />
        ) : null}
      </div>
    </Drawer>
  );
};

type RunFn = <T>(work: Promise<T>) => Promise<T>;

const OwnerTab: React.FC<{ row: OwnerRow; target: ApiTarget; onRun: RunFn }> = ({
  row,
  target,
  onRun,
}) => {
  const owner = row.owner;
  const orgId = row.organizationId;
  const name = row.organizationName;
  // The API refuses resend/revoke once the owner has signed in, and refuses
  // revoke for an organization that owns stations. Say so here rather than
  // letting the operator discover it as a 409.
  const signedIn = !!owner?.lastSignInAt;
  const hasStations = row.stationCount > 0;
  const deactivated = owner?.status === 'deactivated';

  return (
    <Section>
      <Definitions
        rows={[
          [
            'Owner',
            owner ? `${owner.fullName ?? '(no name)'} <${owner.email ?? 'no email'}>` : 'None',
          ],
          ['Status', owner?.status ?? 'no owner'],
          ['Last sign-in', owner?.lastSignInAt ?? 'never'],
          ['Stations', `${row.readyStationCount} of ${row.stationCount} ready`],
          ['Created', row.createdAt],
        ]}
      />
      <PlatformAction
        label="Resend invite"
        organizationName={name}
        description="Deletes the pending login and sends a fresh invite email to the owner."
        reason="none"
        disabled={!owner?.email || signedIn}
        disabledHint={signedIn ? 'Owner has already signed in.' : 'Owner has no email on file.'}
        onConfirm={async () => {
          await onRun(commands.ownerAction(target, { orgId, verb: 'resend' }));
          return `Invite resent to ${owner?.email}`;
        }}
      />
      <PlatformAction
        label="Revoke invite"
        organizationName={name}
        variant="danger"
        description="Cancels a never-used invite and suspends the organization. The email can be invited again."
        reason="none"
        disabled={signedIn || hasStations}
        disabledHint={
          signedIn
            ? 'Owner has signed in — deactivate instead.'
            : 'Organization has stations — deactivate instead.'
        }
        onConfirm={async () => {
          await onRun(commands.ownerAction(target, { orgId, verb: 'revoke' }));
          return `Invite revoked for ${name}`;
        }}
      />
      {deactivated ? (
        <PlatformAction
          label="Reactivate owner"
          organizationName={name}
          description="Unbans the login and lifts the suspension this deactivation applied."
          reason="none"
          onConfirm={async () => {
            await onRun(commands.ownerAction(target, { orgId, verb: 'reactivate' }));
            return `${name} reactivated`;
          }}
        />
      ) : (
        <PlatformAction
          label="Deactivate owner"
          organizationName={name}
          variant="danger"
          description="Bans the owner's login and suspends the organization. Data is kept."
          reason="none"
          disabled={!owner}
          disabledHint="No owner on this organization."
          onConfirm={async () => {
            await onRun(commands.ownerAction(target, { orgId, verb: 'deactivate' }));
            return `${name} deactivated`;
          }}
        />
      )}
    </Section>
  );
};

const AccessTabs: React.FC<{
  tab: string;
  name: string;
  orgId: string;
  target: ApiTarget;
  access: OrganizationAccess;
  onRun: RunFn;
}> = ({ tab, name, orgId, target, access, onRun }) => {
  if (tab === 'capabilities') {
    return (
      <Section>
        {/* Driven entirely by the server's registry: a capability added to the
            API shows up here without a change to this app. */}
        {access.registry.capabilities.map((key) => {
          const enabled = access.effective.capabilities[key]?.enabled ?? false;
          return (
            <div
              key={key}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
            >
              <div style={{ fontSize: '13px' }}>
                <strong>{key}</strong>{' '}
                <span style={{ color: enabled ? 'var(--state-success-fg)' : 'var(--text-muted)' }}>
                  {enabled ? 'enabled' : 'not enabled'}
                </span>
              </div>
              <PlatformAction
                label={enabled ? 'Revoke' : 'Grant'}
                organizationName={name}
                variant={enabled ? 'danger' : 'primary'}
                description={
                  enabled
                    ? `Removes ${key} from ${name}. The plan baseline still applies.`
                    : `Grants ${key} to ${name} on top of its plan.`
                }
                onConfirm={async (reason) => {
                  const result = await onRun(
                    enabled
                      ? commands.revokeCapability(target, { orgId, key, reason })
                      : commands.grantCapability(target, { orgId, key, reason }),
                  );
                  return changed(
                    result,
                    enabled ? `${key} revoked` : `${key} granted`,
                    `${key} was already ${enabled ? 'revoked' : 'granted'}`,
                  );
                }}
              />
            </div>
          );
        })}
        <History
          title="Grant history"
          empty="No capability has ever been granted."
          entries={access.grants.map((g) => ({
            id: `${g.capabilityKey}-${g.createdAt}`,
            headline: `${g.capabilityKey} — ${g.revokedAt ? `revoked ${g.revokedAt} by ${g.revokedByEmail ?? 'unknown'}` : 'active'}`,
            detail: `granted ${g.createdAt} by ${g.grantedByEmail ?? 'unknown'}${g.reason ? ` — ${g.reason}` : ''}`,
          }))}
        />
      </Section>
    );
  }

  if (tab === 'limits') {
    return (
      <Section>
        {access.registry.limits.map((key) => (
          <LimitRow
            key={key}
            limitKey={key}
            name={name}
            orgId={orgId}
            target={target}
            entry={access.effective.limits[key]}
            onRun={onRun}
          />
        ))}
        <History
          title="Override history"
          empty="No limit has ever been overridden."
          entries={access.limitOverrides.map((o) => ({
            id: `${o.limitKey}-${o.createdAt}`,
            headline: `${o.limitKey} = ${o.value} — ${o.revokedAt ? `cleared ${o.revokedAt} by ${o.revokedByEmail ?? 'unknown'}` : 'active'}`,
            detail: `set ${o.createdAt} by ${o.assignedByEmail ?? 'unknown'}${o.reason ? ` — ${o.reason}` : ''}`,
          }))}
        />
      </Section>
    );
  }

  return <BillingTab name={name} orgId={orgId} target={target} access={access} onRun={onRun} />;
};

const LimitRow: React.FC<{
  limitKey: string;
  name: string;
  orgId: string;
  target: ApiTarget;
  entry: { value: number; used: number; reached: boolean } | undefined;
  onRun: RunFn;
}> = ({ limitKey, name, orgId, target, entry, onRun }) => {
  const [value, setValue] = useState<string>(String(entry?.value ?? 1));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ fontSize: '13px' }}>
        <strong>{limitKey}</strong>{' '}
        <span style={{ color: entry?.reached ? 'var(--state-warning-fg)' : 'var(--text-muted)' }}>
          {entry
            ? `${entry.used} of ${entry.value} used${entry.reached ? ' (reached)' : ''}`
            : 'not resolved'}
        </span>
      </div>
      <Field label="New value">
        <NumberInput min={0} value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <PlatformAction
        label="Set limit"
        organizationName={name}
        // The API requires a reason on `set` — a raised allowance is a
        // commercial decision, and the override outlives whoever made it.
        reason="required"
        description={`Overrides ${limitKey} for ${name} to ${value || '—'}, above or below the plan value.`}
        onConfirm={async (reason) => {
          const result = await onRun(
            commands.setLimit(target, {
              orgId,
              key: limitKey,
              value: Number(value),
              reason: reason!,
            }),
          );
          return changed(result, `${limitKey} set to ${value}`, `${limitKey} was already ${value}`);
        }}
      />
      <PlatformAction
        label="Clear override"
        organizationName={name}
        variant="danger"
        description={`Returns ${limitKey} to the value supplied by the plan.`}
        onConfirm={async (reason) => {
          const result = await onRun(commands.clearLimit(target, { orgId, key: limitKey, reason }));
          return changed(result, `${limitKey} override cleared`, `${limitKey} had no override`);
        }}
      />
    </div>
  );
};

const BillingTab: React.FC<{
  name: string;
  orgId: string;
  target: ApiTarget;
  access: OrganizationAccess;
  onRun: RunFn;
}> = ({ name, orgId, target, access, onRun }) => {
  const subscription = access.effective.subscription;
  const [plan, setPlan] = useState(access.effective.plan ?? access.registry.plans[0] ?? 'CORE');
  const [status, setStatus] = useState(subscription.status);
  const [accessUntil, setAccessUntil] = useState('');

  return (
    <Section>
      <Definitions
        rows={[
          ['Plan', access.effective.plan ?? '(none)'],
          ['Subscription', `${subscription.status} (${subscription.mode})`],
          ['Access until', subscription.accessUntil ?? '(open)'],
        ]}
      />

      <Field label="Plan">
        <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
          {access.registry.plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <PlatformAction
        label="Set plan"
        organizationName={name}
        description={`Assigns the ${plan} plan, changing the capabilities and limits ${name} gets by default.`}
        onConfirm={async (reason) => {
          const result = await onRun(commands.setPlan(target, { orgId, plan, reason }));
          return changed(result, `Plan set to ${plan}`, `${name} was already on ${plan}`);
        }}
      />

      <Field label="Subscription status">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {SUBSCRIPTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Access until"
        hint="Leave empty to let the server decide — PAST_DUE then gets the standard 7-day grace period."
      >
        <TextInput
          value={accessUntil}
          onChange={(e) => setAccessUntil(e.target.value)}
          placeholder="2026-01-31T00:00:00Z"
        />
      </Field>
      <PlatformAction
        label="Set subscription"
        organizationName={name}
        variant={status === 'ACTIVE' || status === 'TRIALING' ? 'primary' : 'danger'}
        description={`Moves ${name} to ${status}${accessUntil ? ` until ${accessUntil}` : ''}. RESTRICTED and SUSPENDED stop operators working.`}
        onConfirm={async (reason) => {
          const result = await onRun(
            commands.setSubscription(target, {
              orgId,
              status,
              accessUntil: accessUntil.trim() || undefined,
              reason,
            }),
          );
          return changed(result, `Subscription set to ${status}`, `${name} was already ${status}`);
        }}
      />
      <PlatformAction
        label="Confirm payment"
        organizationName={name}
        description="Payment received: back to ACTIVE immediately, grace window cleared."
        onConfirm={async (reason) => {
          const result = await onRun(commands.confirmPayment(target, { orgId, reason }));
          return changed(
            result,
            'Payment confirmed — access restored',
            `${name} was already active`,
          );
        }}
      />

      <Divider label="Manual stop" />
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
        Suspension answers a different question from billing: a suspended organization that pays its
        invoice stays suspended, and restoring returns it to whatever its billing lifecycle says.
      </p>
      <PlatformAction
        label="Suspend organization"
        organizationName={name}
        variant="danger"
        reason="required"
        description={`Stops ${name} for a security, legal, fraud or abuse reason.`}
        onConfirm={async (reason) => {
          const result = await onRun(commands.suspend(target, { orgId, reason: reason! }));
          return changed(result, `${name} suspended`, `${name} was already suspended`);
        }}
      />
      <PlatformAction
        label="Restore organization"
        organizationName={name}
        reason="required"
        description="Lifts the manual stop. This is not the same as marking the invoice paid."
        onConfirm={async (reason) => {
          const result = await onRun(commands.restore(target, { orgId, reason: reason! }));
          return changed(result, `${name} restored`, `${name} was not suspended`);
        }}
      />
    </Section>
  );
};

// --- Small presentational helpers -------------------------------------------

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>{children}</div>
);

const Definitions: React.FC<{ rows: [string, string][] }> = ({ rows }) => (
  <dl
    style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: 'var(--space-2) var(--space-4)',
      margin: 0,
      fontSize: '13px',
    }}
  >
    {rows.map(([label, value]) => (
      <React.Fragment key={label}>
        <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
        <dd style={{ margin: 0, color: 'var(--text-strong)' }}>{value}</dd>
      </React.Fragment>
    ))}
  </dl>
);

const Divider: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      borderTop: '1px solid var(--border-soft)',
      paddingTop: 'var(--space-3)',
      fontSize: '12px',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: 'var(--text-muted)',
    }}
  >
    {label}
  </div>
);

const History: React.FC<{
  title: string;
  empty: string;
  entries: { id: string; headline: string; detail: string }[];
}> = ({ title, empty, entries }) => (
  <div>
    <Divider label={title} />
    {entries.length === 0 ? (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingTop: 'var(--space-2)' }}>
        {empty}
      </div>
    ) : (
      <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-4)', fontSize: '12px' }}>
        {entries.map((entry) => (
          <li key={entry.id} style={{ marginBottom: 'var(--space-2)' }}>
            <div style={{ color: 'var(--text-strong)' }}>{entry.headline}</div>
            <div style={{ color: 'var(--text-muted)' }}>{entry.detail}</div>
          </li>
        ))}
      </ul>
    )}
  </div>
);
