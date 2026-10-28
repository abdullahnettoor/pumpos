import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import {
  PERMISSIONS,
  PERMISSION_IDS,
  ROLES,
  can,
  defaultPermissionsFor,
  principalOf,
  renderRoleMatrixMarkdown,
} from './catalogue.js';

const MATRIX_FILE = new URL('./permission-matrix.generated.md', import.meta.url);

describe('Permission catalogue', () => {
  it('matches the committed Role x Permission matrix (regenerate with UPDATE_MATRIX=1)', () => {
    const generated = renderRoleMatrixMarkdown();
    if (process.env.UPDATE_MATRIX === '1') writeFileSync(MATRIX_FILE, generated);
    expect(readFileSync(MATRIX_FILE, 'utf8')).toBe(generated);
  });

  it('only names Permissions that exist as prerequisites, and never itself', () => {
    for (const id of PERMISSION_IDS) {
      for (const pre of PERMISSIONS[id].prerequisites) {
        expect(PERMISSION_IDS, `${id} requires ${pre}`).toContain(pre);
        expect(pre).not.toBe(id);
      }
    }
  });

  it('keeps every Role default closed under prerequisites', () => {
    for (const role of ROLES) {
      for (const id of defaultPermissionsFor(role)) {
        for (const pre of PERMISSIONS[id].prerequisites) {
          expect(can(principalOf(role), pre), `${role}: ${id} requires ${pre}`).toBe(true);
        }
      }
    }
  });

  it('gives the Owner every Permission except the Role-specific presentation ones', () => {
    const roleSpecific = ['dashboard.yourShift', 'mobile.densityShortcut'];
    for (const id of PERMISSION_IDS.filter((i) => !roleSpecific.includes(i))) {
      expect(can(principalOf('Owner'), id), id).toBe(true);
    }
  });

  it('prefers an explicit effective Permission set over the Role defaults', () => {
    const principal = { role: 'Staff' as const, permissions: new Set(['expenses.void' as const]) };
    expect(can(principal, 'expenses.void')).toBe(true);
    expect(can(principal, 'shifts.open')).toBe(false);
  });

  it('fixes the two inconsistencies named in #551', () => {
    expect(can(principalOf('Accountant'), 'inventory.density')).toBe(true);
    expect(PERMISSIONS['shifts.closeDay'].defaults).toEqual(['Owner', 'Manager']);
  });
});
