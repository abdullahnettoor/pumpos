import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CUSTOM_PERMISSIONS_CAPABILITY, PERMISSIONS, type UserPermissionsView } from '@pump/shared';
import { queryKeys, useUserPermissions } from '../../query/hooks.js';
import { useCapability } from '../../access/CapabilityGate.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { useRunTask } from '../../utils/runTask.js';
import { Drawer } from '../Drawer.js';
import { Switch } from '../primitives/Toggle.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { Button, Chip, Icon } from '../../pump-ds/index.js';
import { userService } from './TeamMemberDrawers.js';
import {
  alsoTurnsOff,
  alsoTurnsOn,
  diffFromDefaults,
  hasChanges,
  isChanged,
  labelOf,
  permissionAreas,
  resolveDraft,
  togglePermission,
} from './permissionsModel.js';

const READ_ONLY_REASON: Record<string, string> = {
  OWNER: 'The Owner always has every Permission. They cannot be changed.',
  ATTENDANT: 'Attendants have a fixed set for the mobile handover. They cannot be changed.',
};

const names = (ids: string[]) => ids.map(labelOf).join(', ');

/** Owner › Team › member › Permissions: areas expand to switches (ADR 0013). */
export const PermissionsDrawer: React.FC<{
  isOpen: boolean;
  user: { id: string; fullName: string; role: string } | null;
  onClose: () => void;
}> = ({ isOpen, user, onClose }) => {
  const q = useUserPermissions(isOpen ? user?.id : null);
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Permissions"
      subtitle={user ? `${user.fullName} · ${user.role}` : undefined}
    >
      {q.isLoading || !user ? (
        <p className="text-[13px] text-ink-muted">Loading permissions…</p>
      ) : q.isError || !q.data ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {withNextStep("Couldn't load permissions", 'Close this and try again.')}
        </p>
      ) : (
        <PermissionsEditor view={q.data as UserPermissionsView} onDone={onClose} />
      )}
    </Drawer>
  );
};

const PermissionsEditor: React.FC<{ view: UserPermissionsView; onDone: () => void }> = ({
  view,
  onDone,
}) => {
  const toast = useToast();
  const runTask = useRunTask();
  const qc = useQueryClient();
  const save = useKeyedSave(`team:permissions:${view.userId}`);
  const capability = useCapability(CUSTOM_PERMISSIONS_CAPABILITY);

  const readOnly = !view.editable;
  const locked = readOnly || !view.entitled;
  // Stored changes are shown even when not applied ("kept, not applied").
  const [desired, setDesired] = useState(() => resolveDraft(view.role, view.changes));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const areas = useMemo(() => permissionAreas(), []);

  const draft = diffFromDefaults(view.role, desired, view.defaults);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      granted: [...view.changes.granted].sort(),
      revoked: [...view.changes.revoked].sort(),
    });

  const toggle = (id: string, on: boolean) =>
    setDesired((d) => togglePermission(view.role, d, view.defaults, id, on));

  const submit = async () => {
    setBusy(true);
    try {
      await save(draft, (idempotencyKey) =>
        userService.setUserPermissions(view.userId, draft, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(withNextStep(err.message || "Couldn't save permissions", 'Save again.'));
      setBusy(false);
      return;
    }
    setBusy(false);
    // The edited member may be the signed-in Owner: always refresh access.
    void qc.invalidateQueries({ queryKey: queryKeys.userPermissions(view.userId) });
    void qc.invalidateQueries({ queryKey: queryKeys.users() });
    void qc.invalidateQueries({ queryKey: queryKeys.access() });
    toast.success('Permissions saved.');
    onDone();
  };

  return (
    <div className="flex flex-col gap-3">
      {readOnly && view.readOnlyReason && (
        <p
          role="note"
          className="rounded-card border border-border-soft bg-surface-alt p-2.5 text-[12px] text-ink-muted"
        >
          {READ_ONLY_REASON[view.readOnlyReason]}
        </p>
      )}
      {!readOnly && !view.entitled && (
        <p
          role="note"
          className="rounded-card border border-border-soft bg-surface-alt p-2.5 text-[12px] text-ink-muted"
        >
          <strong className="text-ink-strong">Custom permissions</strong> is not on your plan.{' '}
          {capability.status === 'upgrade'
            ? capability.message
            : 'Upgrade to change what members can do.'}
          {hasChanges(view.changes) && ' Existing changes are kept, not applied.'}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-muted">
          {hasChanges(draft)
            ? `${draft.granted.length + draft.revoked.length} custom`
            : 'Role defaults'}
        </span>
        {!locked && (
          <Button
            variant="ghost"
            size="xs"
            disabled={!hasChanges(draft)}
            onClick={() => setDesired(resolveDraft(view.role, { granted: [], revoked: [] }))}
          >
            Reset to role defaults
          </Button>
        )}
      </div>

      <div className="flex flex-col divide-y divide-border-soft rounded-card border border-border-soft">
        {areas.map(({ area, ids }) => {
          const expanded = open.has(area);
          const customCount = ids.filter((id) => isChanged(id, draft)).length;
          return (
            <section key={area}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() =>
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(area)) n.delete(area);
                    else n.add(area);
                    return n;
                  })
                }
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium text-ink-strong"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size="xs" />
                  {area}
                </span>
                {customCount > 0 && (
                  <Chip tone="info" size="sm">
                    {customCount} custom
                  </Chip>
                )}
              </button>
              {expanded && (
                <ul className="flex flex-col gap-2 px-3 pb-3">
                  {ids.map((id) => {
                    const never = PERMISSIONS[id].neverDelegable;
                    const on = desired.has(id);
                    const turnsOn = alsoTurnsOn(view.role, desired, view.defaults, id);
                    const turnsOff = alsoTurnsOff(view.role, desired, view.defaults, id);
                    const rowLocked = locked || never;
                    return (
                      <li key={id} className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-default">
                            {PERMISSIONS[id].label}
                            {isChanged(id, draft) && (
                              <Chip tone="info" size="sm">
                                {view.entitled ? 'Custom' : 'Kept, not applied'}
                              </Chip>
                            )}
                            {never && !readOnly && (
                              <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                                <Icon name="lock" size="xs" /> Owner only
                              </span>
                            )}
                          </span>
                          {!rowLocked && turnsOn.length > 0 && (
                            <span className="text-[12px] text-ink-muted">
                              Also turns on {names(turnsOn)}
                            </span>
                          )}
                          {!rowLocked && turnsOff.length > 0 && (
                            <span className="text-[12px] text-ink-muted">
                              Also turns off {names(turnsOff)}
                            </span>
                          )}
                        </div>
                        <Switch
                          checked={on}
                          disabled={rowLocked}
                          aria-label={PERMISSIONS[id].label}
                          onChange={(e) => toggle(id, e.target.checked)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {!locked && (
        <Button
          variant="primary"
          size="md"
          loading={busy}
          disabled={!dirty}
          onClick={() => runTask(submit(), 'Could not save permissions.')}
        >
          Save permissions
        </Button>
      )}
    </div>
  );
};
