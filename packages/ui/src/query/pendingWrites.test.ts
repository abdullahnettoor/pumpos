import { describe, expect, it } from 'vite-plus/test';
import { latestOf, latestWrites, type MutationSnapshot } from './pendingWrites.js';

type V = { drawer: string; shiftId: string };
const snap = (
  status: MutationSnapshot<V>['status'],
  drawer: string,
  submittedAt: number,
  shiftId = 'shift-1',
): MutationSnapshot<V> => ({
  status,
  variables: { drawer, shiftId },
  error: status === 'error' ? new Error(`refused ${drawer}`) : null,
  submittedAt,
});
const byDrawer = (v: V) => (v.shiftId === 'shift-1' ? v.drawer : null);

describe('latestWrites', () => {
  it('keeps the latest write per identity, saving or failed; a saved one drops out', () => {
    const out = latestWrites(
      [
        snap('error', 'DU1', 1),
        snap('pending', 'DU1', 2),
        snap('pending', 'DU2', 1),
        snap('success', 'DU2', 3),
        snap('error', 'DU3', 4),
      ],
      byDrawer,
    );
    expect([...out.keys()]).toEqual(['DU1', 'DU3']);
    expect(out.get('DU1')).toMatchObject({ state: 'saving', error: null });
    expect(out.get('DU3')?.state).toBe('failed');
    expect(out.get('DU3')?.error?.message).toBe('refused DU3');
  });

  it('a newer attempt replaces a failure, and writes the caller does not show are skipped', () => {
    const out = latestWrites(
      [snap('error', 'DU1', 1), snap('success', 'DU1', 2), snap('pending', 'DU1', 3, 'shift-0')],
      byDrawer,
    );
    expect(out.size).toBe(0);
  });
});

describe('latestOf', () => {
  it('picks the later of two writes on one row', () => {
    const failed = {
      state: 'failed' as const,
      variables: {},
      error: new Error('x'),
      submittedAt: 1,
    };
    const saving = { state: 'saving' as const, variables: {}, error: null, submittedAt: 2 };
    expect(latestOf(failed, saving)).toBe(saving);
    expect(latestOf(saving, failed)).toBe(saving);
    expect(latestOf(undefined, failed)).toBe(failed);
    expect(latestOf(undefined, undefined)).toBeUndefined();
  });
});
