import { PERMISSIONS } from '@pump/shared';
import type { RoleChangePreview } from '@pump/shared';
import type { TeamFailure } from './failure.js';

const label = (id: string): string =>
  (PERMISSIONS as Record<string, { label: string } | undefined>)[id]?.label ?? id;

/** What a Role change would drop, one line per Permission; empty when nothing is lost. */
export function droppedLines(preview: Pick<RoleChangePreview, 'droppedChanges'>): string[] {
  const d = preview.droppedChanges;
  if (!d) return [];
  return [
    ...d.granted.map((id) => `${label(id)} (extra)`),
    ...d.revoked.map((id) => `${label(id)} (removed)`),
  ];
}

/** Shown when the preview cannot be read: the change is not saved. */
export const roleChangeCheckFailure: TeamFailure = {
  message: "Couldn't check what a role change would reset. Nothing was saved.",
  unknownOutcome: false,
  earlierAttemptReceived: false,
};
